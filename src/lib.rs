use frame_support::runtime;

use polkadot_sdk::*;
use polkadot_sdk::{
    frame_support::traits::fungible::Mutate,
    polkadot_runtime_common::BuildStorage,
    polkadot_sdk_frame::{log, runtime::prelude::*, testing_prelude::*},
    sp_keystore::{testing::MemoryKeystore, KeystoreExt},
    sp_runtime::{AccountId32, Perbill},
};

pub type Balance = u128;
pub type AccountId = AccountId32;
pub type Block = frame_system::mocking::MockBlock<Runtime>;

pub const ALICE: AccountId32 = AccountId32::new([1u8; 32]);
pub const BOB: AccountId32 = AccountId32::new([2u8; 32]);
pub const CHARLIE: AccountId32 = AccountId32::new([3u8; 32]);

#[runtime]
mod runtime {
    #[runtime::runtime]
    #[runtime::derive(
        RuntimeCall,
        RuntimeEvent,
        RuntimeError,
        RuntimeOrigin,
        RuntimeFreezeReason,
        RuntimeHoldReason,
        RuntimeSlashReason,
        RuntimeLockId,
        RuntimeTask
    )]
    pub struct Runtime;

    #[runtime::pallet_index(0)]
    pub type System = frame_system;

    #[runtime::pallet_index(1)]
    pub type Timestamp = pallet_timestamp;

    #[runtime::pallet_index(2)]
    pub type Balances = pallet_balances;

    #[runtime::pallet_index(3)]
    pub type Contracts = pallet_revive;
}

#[derive_impl(frame_system::config_preludes::SolochainDefaultConfig)]
impl frame_system::Config for Runtime {
    type Block = Block;
    type AccountId = AccountId;
    type AccountData = pallet_balances::AccountData<<Runtime as pallet_balances::Config>::Balance>;
}

#[derive_impl(pallet_balances::config_preludes::TestDefaultConfig)]
impl pallet_balances::Config for Runtime {
    type AccountStore = System;
    type Balance = Balance;
    type ExistentialDeposit = ConstU128<1_000>;
}

#[derive_impl(pallet_timestamp::config_preludes::TestDefaultConfig)]
impl pallet_timestamp::Config for Runtime {}

parameter_types! {
    pub const UnstableInterface: bool = true;
    pub const DepositPerByte: Balance = 1;
    pub const DepositPerItem: Balance = 2;
    pub const CodeHashLockupDepositPercent: Perbill = Perbill::from_percent(0);
}

#[derive_impl(pallet_revive::config_preludes::TestDefaultConfig)]
impl pallet_revive::Config for Runtime {
    type Time = Timestamp;
    type Currency = Balances;
    type CallFilter = ();
    type ChainExtension = ();
    type DepositPerByte = DepositPerByte;
    type DepositPerItem = DepositPerItem;
    type AddressGenerator = pallet_revive::DefaultAddressGenerator;
    type UnsafeUnstableInterface = UnstableInterface;
    type UploadOrigin = EnsureSigned<AccountId>;
    type InstantiateOrigin = EnsureSigned<AccountId>;
    type Migrations = ();
    type CodeHashLockupDepositPercent = CodeHashLockupDepositPercent;
    type Debug = ();
}

#[derive(Default)]
pub struct ExtBuilder {
    // TODO add setup fields
}

impl ExtBuilder {
    pub fn build(self) -> sp_io::TestExternalities {
        sp_tracing::try_init_simple();
        let mut t = frame_system::GenesisConfig::<Runtime>::default()
            .build_storage()
            .unwrap();
        pallet_balances::GenesisConfig::<Runtime> { balances: vec![] }
            .assimilate_storage(&mut t)
            .unwrap();
        let mut ext = sp_io::TestExternalities::new(t);
        ext.register_extension(KeystoreExt::new(MemoryKeystore::new()));
        ext.execute_with(|| System::set_block_number(1));

        ext
    }
}

// TODO
pub struct Specs;

pub fn run_test(_specs: Specs) {
    // TODO specs should define the contracts to deploy
    let code = include_bytes!("../fixtures/dummy.polkavm").to_vec();

    ExtBuilder::default().build().execute_with(|| {
        // TODO Specs should define endowments
        let _ = <Runtime as pallet_revive::Config>::Currency::set_balance(&ALICE, 1_000_000_000);

        // TODO Specs should define the list of operations to execute
        let res = Contracts::instantiate_with_code(
            RuntimeOrigin::signed(ALICE),
            1_000,
            Weight::from_parts(100_000_000_000, 3 * 1024 * 1024),
            10_000_000,
            code,
            vec![],
            vec![],
        );

        dbg!(&res);

        // TODO Specs should define the expected result
        assert_ok!(res);
    });
}

#[test]
pub fn instantiate_with_code_works() {
    run_test(Specs {})
}
