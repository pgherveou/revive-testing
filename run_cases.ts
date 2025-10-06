#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env

interface AbiParameter {
  name: string;
  type: string;
  internalType?: string;
  components?: AbiParameter[];
}

interface AbiFunction {
  type: "function";
  name: string;
  inputs: AbiParameter[];
  outputs: AbiParameter[];
  stateMutability: "pure" | "view" | "nonpayable" | "payable";
}

interface AbiConstructor {
  type: "constructor";
  inputs: AbiParameter[];
  stateMutability: "nonpayable" | "payable";
}

interface AbiEvent {
  type: "event";
  name: string;
  inputs: (AbiParameter & { indexed?: boolean })[];
  anonymous?: boolean;
}

interface AbiError {
  type: "error";
  name: string;
  inputs: AbiParameter[];
}

type AbiItem = AbiFunction | AbiConstructor | AbiEvent | AbiError;

interface TestCase {
  name: string;
  inputs: Array<{
    method: string;
    calldata?: string | string[];
    caller?: string;
    expected?: {
      return_data?: string[];
      events?: Array<{
        address?: string;
        topics?: string[];
        values?: string[];
      }>;
    };
  }>;
  expected?: string[] | {
    return_data?: string[];
    events?: Array<{
      address?: string;
      topics?: string[];
      values?: string[];
    }>;
  };
}

interface TestSpec {
  cases: TestCase[];
}

/**
 * Executes a shell command and returns its stdout output.
 * Throws an error if the command fails (non-zero exit code).
 *
 * @param cmd - Array of command and arguments to execute
 * @returns The command's stdout output as a string
 * @throws Error if command exits with non-zero code
 */
async function runCommand(cmd: string[]): Promise<string> {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const errorText = new TextDecoder().decode(stderr);
    throw new Error(`Command failed: ${cmd.join(" ")}\n${errorText}`);
  }

  return new TextDecoder().decode(stdout);
}

/**
 * Extracts the test specification from special //! comments in a Solidity file.
 * The comments should contain valid JSON that describes test cases.
 *
 * @param solFile - Path to the Solidity file containing test spec
 * @returns Parsed test specification object
 */
async function extractSpec(solFile: string): Promise<TestSpec> {
  const content = await Deno.readTextFile(solFile);
  const lines = content.split("\n");
  const specLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\/\/!\s*(.*)$/);
    if (match) {
      specLines.push(match[1]);
    }
  }

  const specJson = specLines.join("\n");
  return JSON.parse(specJson);
}

/**
 * Extracts the first contract name from Solidity source code.
 *
 * @param solFile - Path to the file (used for error messages)
 * @param content - The Solidity source code content
 * @returns The name of the first contract found
 * @throws Error if no contract is found
 */
function extractContractName(solFile: string, content: string): string {
  const match = content.match(/contract\s+([A-Za-z0-9_]+)/);
  if (!match) {
    throw new Error(`Could not find contract name in ${solFile}`);
  }
  return match[1];
}

/**
 * Formats calldata for use in cast commands.
 * Converts arrays to space-separated strings, filters out null/undefined.
 *
 * @param calldata - Calldata as string, array, or undefined
 * @returns Formatted calldata string for command line usage
 */
function formatCalldata(calldata: string | string[] | undefined): string {
  if (!calldata || calldata === "null") return "";
  if (Array.isArray(calldata)) {
    return calldata.join(" ");
  }
  return calldata;
}

/**
 * Constructs the full function signature from ABI by looking up parameter types.
 * Falls back to no-parameter signature if function is not found in ABI.
 *
 * @param abi - The contract ABI array
 * @param methodName - The name of the function
 * @returns Full function signature like "main(uint256,uint256)"
 */
function getFunctionSignature(abi: AbiItem[], methodName: string): string {
  // Find the function in the ABI
  const func = abi.find((item): item is AbiFunction => item.type === "function" && item.name === methodName);

  if (!func) {
    // If not found, assume no parameters
    return `${methodName}()`;
  }

  // Construct the signature with parameter types
  const paramTypes = func.inputs.map((input) => input.type).join(",");
  return `${methodName}(${paramTypes})`;
}

/**
 * Normalizes a numeric value (hex or decimal) to lowercase hex for comparison.
 * Handles both hex (0x-prefixed) and decimal string inputs.
 *
 * @param value - The value to normalize (hex or decimal string)
 * @returns Lowercase hex string without 0x prefix
 */
function normalizeHex(value: string): string {
  // Convert to BigInt and back to normalized hex
  const val = value.trim();

  // Handle hex values
  if (val.startsWith("0x") || val.startsWith("0X")) {
    return BigInt(val).toString(16).toLowerCase();
  }

  // Handle decimal values
  return BigInt(val).toString(16).toLowerCase();
}

/**
 * Main function that orchestrates the test execution process:
 * 1. Extracts test spec from Solidity file comments
 * 2. Compiles the contract with Forge
 * 3. Deploys the contract
 * 4. Executes each test case and validates results
 */
async function main() {
  if (Deno.args.length < 1) {
    console.error("Usage: ./run_cases.ts <solidity_file>");
    Deno.exit(1);
  }

  const solFile = Deno.args[0];

  try {
    await Deno.stat(solFile);
  } catch {
    console.error(`Error: File '${solFile}' not found.`);
    Deno.exit(1);
  }

  // Extract test spec
  const spec = await extractSpec(solFile);
  const content = await Deno.readTextFile(solFile);
  const contractName = extractContractName(solFile, content);

  // Compile with Forge
  console.log("🔨 Building contract...");
  await runCommand(["forge", "build", solFile]);

  // Get artifact
  const fileName = solFile.split("/").pop()!;
  const artifactPath = `out/${fileName}/${contractName}.json`;

  let artifact: { bytecode: { object: string }; abi: AbiItem[] };
  try {
    const artifactContent = await Deno.readTextFile(artifactPath);
    artifact = JSON.parse(artifactContent);
  } catch {
    console.error(`Error: Artifact not found at ${artifactPath}`);
    Deno.exit(1);
  }

  const privateKey = "5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
  const bytecode = artifact.bytecode.object;

  // Deploy contract
  console.log(`🚀 Deploying ${contractName}...`);
  const deployOutput = await runCommand([
    "cast",
    "send",
    "--private-key",
    privateKey,
    "--create",
    bytecode,
    "--json",
  ]);

  const deployResult = JSON.parse(deployOutput);
  let address = deployResult.contractAddress;
  console.log(`✅ Deployed at ${address}`);
  console.log();

  // Run test cases
  for (let i = 0; i < spec.cases.length; i++) {
    const testCase = spec.cases[i];
    console.log(`🧪 Running case #${i} (${testCase.name})...`);

    for (let j = 0; j < testCase.inputs.length; j++) {
      const input = testCase.inputs[j];
      const method = input.method;
      const calldata = formatCalldata(input.calldata);

      if (method === "#deployer") {
        console.log("  ⚙️  Deploying new instance...");

        let deployBytecode = bytecode;

        // Handle constructor arguments
        if (input.calldata) {
          if (typeof input.calldata === "string") {
            // If it's a hex string, append it to bytecode (remove 0x prefix if present)
            const hexData = input.calldata.startsWith("0x") ? input.calldata.slice(2) : input.calldata;
            deployBytecode = bytecode + hexData;
          } else if (Array.isArray(input.calldata) && input.calldata.length > 0) {
            // If it's an array, ABI-encode each value as uint256 (32 bytes)
            const encoded = input.calldata.map((val: string) => {
              const num = BigInt(val);
              return num.toString(16).padStart(64, "0");
            }).join("");
            deployBytecode = bytecode + encoded;
          }
        }

        const deployCmd = ["cast", "send", "--private-key", privateKey, "--create", deployBytecode, "--json"];

        const output = await runCommand(deployCmd);
        const result = JSON.parse(output);
        address = result.contractAddress;
        console.log(`  🆕 New contract deployed at ${address}`);
      } else {
        // Get proper function signature from ABI
        const methodSig = method.includes("(") ? method : getFunctionSignature(artifact.abi, method);
        const cmd = ["cast", "call", address, methodSig];

        if (calldata) {
          console.log(`  → ${methodSig} ${calldata}`);
          cmd.push(...calldata.split(" "));
        } else {
          console.log(`  → ${methodSig}`);
        }

        try {
          const output = await runCommand(cmd);
          const actualResult = output.trim();

          // Get expected value from input or testCase level
          const expected = input.expected || testCase.expected;
          let expectedValue: string | undefined;

          if (expected) {
            if (Array.isArray(expected)) {
              expectedValue = expected[0];
            } else if (expected.return_data) {
              expectedValue = expected.return_data[0];
            }
          }

          if (expectedValue !== undefined) {
            // Normalize both values for comparison
            const normalizedActual = normalizeHex(actualResult);
            const normalizedExpected = normalizeHex(expectedValue);

            if (normalizedActual === normalizedExpected) {
              console.log(`  ✅ Result: ${actualResult} (expected: ${expectedValue})`);
            } else {
              console.log(`  ❌ Result: ${actualResult} (expected: ${expectedValue})`);
            }
          } else {
            console.log(`  ✅ Result: ${actualResult}`);
          }
        } catch (error) {
          console.error(`  ❌ Failed: ${error}`);
        }
      }
    }

    console.log(`✅ Case '${testCase.name}' completed.`);
    console.log();
  }

  console.log("🎉 All cases executed!");
}

if (import.meta.main) {
  main();
}
