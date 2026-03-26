require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PK = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat:     { chainId: 31337 },
    baseSepolia: { url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",  chainId: 84532, accounts: [PK] },
    base:        { url: process.env.BASE_MAINNET_RPC || "https://mainnet.base.org",  chainId: 8453,  accounts: [PK] },
  },
};
