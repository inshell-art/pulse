use starknet::ContractAddress;


pub fn ADMIN() -> ContractAddress {
    'ADMIN'.try_into().unwrap()
}
pub fn ALICE() -> ContractAddress {
    'ALICE'.try_into().unwrap()
}
pub fn TREASURY() -> ContractAddress {
    'TREASURY'.try_into().unwrap()
}
pub fn PAY_TOKEN() -> ContractAddress {
    'PAYTOKEN'.try_into().unwrap()
} // not deployed; we mock its calls
pub fn SELECTOR_TRANSFER_FROM() -> felt252 {
    selector!("transfer_from")
}
pub fn ZERO_CONTRACT_ADDRESS() -> ContractAddress {
    0.try_into().unwrap()
}

pub const GENESIS_PRICE: u256 = 1_000_u256;
pub const GENESIS_FLOOR: u256 = 900_u256;
pub const K: u256 = 600_u256;
pub const PTS: felt252 = 1;
pub const FIRST_ID: u256 = 10_000_u256;
