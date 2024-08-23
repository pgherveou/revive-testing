Experimental test runner for RISC-V pallet-revive smart contracts

```rust
#[test]
fn instantiate_works() {
    run_test(Specs {
        balances: vec![(ALICE, 1_000_000_000)],
        actions: vec![SpecsAction::Instantiate {
            origin: ALICE,
            value: 1_000,
            gas_limit: Some(GAS_LIMIT),
            storage_deposit_limit: Some(DEPOSIT_LIMIT),
            code: Code::Bytes(include_bytes!("../fixtures/dummy.polkavm").to_vec()),
            data: vec![],
            salt: vec![],
        }],
    })
}
```

The tests are meant to use a serializable format to define the test cases, so that they can be ported to other VM.

```rust
#[test]
fn instantiate_with_json() {
    let specs = serde_json::from_str::<Specs>(
        r#"
        {
        "balances": [
            [ "5C62Ck4UrFPiBtoCmeSrgF7x9yv9mn38446dhCpsi2mLHiFT", 1000000000 ]
        ],
        "actions": [
            {
                "Instantiate": {
                    "origin": "5C62Ck4UrFPiBtoCmeSrgF7x9yv9mn38446dhCpsi2mLHiFT",
                    "value": 1000,
                    "code": {
                        "Path": "fixtures/dummy.polkavm"
                    }
                }
            }
        ]
        }
    "#,
    )
    .unwrap();
    run_test(specs);
}
```
