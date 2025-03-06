import * as dotenv from "dotenv"; // 環境構築時にこのパッケージはインストールしてあります。
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "@openzeppelin/hardhat-upgrades"; // Upgradeableで必要

// .envファイルから環境変数をロードします。
dotenv.config();

if (process.env.TEST_ACCOUNT_PRIVATE_KEY === undefined) {
  console.log("private key is missing");
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17", // @tokenysolutions/t-rex
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200     // default:200（Token.solの容量超過対応:必要に応じて下げる）
      },
    },
  },
  networks: {
    avacloud_testnet: { // TestNet設定
//        url: "https://subnets.avax.network/testnetfir/testnet/rpc", //AvaCloudのDevNet用いる(シンボル：TESTAVAX)
      url: "https://testnet-testnetfir-yfa99.avax-test.network/ext/bc/2JQpYaTf3HoxfZA2h8aHEpTYFPJFpmW5KNwH8uMiUvadWAEMTH/rpc?token=af5dfa0a0b4a7f53c0b12762708c72fcee5138d2ef0a0771a77fb6db8f4f2385", //AvaCloudのDevNet用いる(シンボル：TESTAVAX)
      chainId: 7158,
      accounts:
        process.env.AVAX_ACCOUNT_PRIVATE_KEY !== undefined
          ? process.env.AVAX_ACCOUNT_PRIVATE_KEY.split(',')//複数のウォレットアドレス連携のため、splitにて.envファイルのアドレスを分割し、配列化
          : [],//条件に一致しない場合は、空の配列
    },
    avacloud: { // DevNet設定
      url: "https://subnets.avacloud.io/dccea1f4-95fc-4663-8749-fa49ea527c97", //AvaCloudのDevNet用いる(シンボル：TESTAVAX)
      chainId: 1101591,
      accounts:
        process.env.AVAX_ACCOUNT_PRIVATE_KEY !== undefined
          ? process.env.AVAX_ACCOUNT_PRIVATE_KEY.split(',')//複数のウォレットアドレス連携のため、splitにて.envファイルのアドレスを分割し、配列化
          : [],//条件に一致しない場合は、空の配列
    },
    fuji: {
      url: "https://subnets.avax.network/lt0/testnet/rpc",
      chainId: 31330,
      accounts:
        process.env.FUJI_ACCOUNT_PRIVATE_KEY !== undefined
          ? [process.env.FUJI_ACCOUNT_PRIVATE_KEY]
          : [],
    },
    hardhat: {
      chainId: 31337,
    },
  },
  paths: {
    sources: "./contracts",
  },
};

export default config;

