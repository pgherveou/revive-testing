#!/bin/sh

# This is a script that's used to reproduce one of the errors that were detected
# by the differential testing framework. To be more specific, it's used to
# reproduce the following error:
# "Invalid Transaction"

POLKADOT_SDK_PATH="$HOME/polkadot-sdk"
SUBSTRATE_NODE_PATH="$POLKADOT_SDK_PATH/target/release/substrate-node"
REVIVE_DEV_NODE_PATH="$POLKADOT_SDK_PATH/target/release/revive-dev-node"
ETH_RPC_PATH="$POLKADOT_SDK_PATH/target/release/eth-rpc"
RETESTER="$HOME/github/revive-differential-tests/target/release/retester"
cat >corp.json <<'EOF'
{
  "name": "Reproducing Invalid Transaction",
  "paths": [
    "../resolc-compiler-tests/fixtures/solidity/simple"
  ]
}
EOF

mkdir workdir
echo "Compiling the retester binary"
echo '🔮 Starting The DT Framework, this may take a while 🔮'
RUST_LOG=info $RETESTER \
	test \
	--platform revive-dev-node-revm-solc \
	--corpus ./corp.json \
	--working-directory ./workdir \
	--concurrency.number-of-nodes 1 \
	--wallet.additional-keys 100000 \
	--kitchensink.path "$SUBSTRATE_NODE_PATH" \
	--revive-dev-node.path "$REVIVE_DEV_NODE_PATH" \
	--eth-rpc.path "$ETH_RPC_PATH" \
	>logs.log \
	2>output.log
