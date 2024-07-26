import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      mining: {
        auto: true
      },
      gas: "auto",
      enableRip7212: true,
    },
  },
  gasReporter: {
    enabled: (process.env.REPORT_GAS) ? true : false,
  }
};

export default config;
