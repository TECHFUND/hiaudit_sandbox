# sto-app-core-contract

## STLINKスマートコントラクト

- ### /README.md を参照

## スマートコントラクトビルド手順

### 前提事項

```sh
# Node.jsがインストールされていること
$ node --version
v20.17.0
```

### 初期セットアップ

```sh
# 当プロジェクトのディレクトリに移動
cd ./sto-app-core-contract

# 初回利用時、または、ルートの package.json が更新された場合のみ実行
npm install
```

### 開発中に使うコマンド

```sh
### スマートコントラクトビルド作業

# type-chain実行（abiが更新された場合のみ実行）
npx hardhat typechain

# ビルド
npx hardhat compile

# 単体テスト
npx hardhat test

# デプロイ　※以下は仮環境（実環境はAvaCloud環境構築後に開放予定）
## Devnet環境（仮環境）
### url: https://subnets.avacloud.io/dccea1f4-95fc-4663-8749-fa49ea527c97
### chainId: 1101591
npx hardhat run script/deploy.ts --network avacloud
## Testnet環境（仮環境）
### url: https://testnet-testnetfir-yfa99.avax-test.network/ext/bc/2JQpYaTf3HoxfZA2h8aHEpTYFPJFpmW5KNwH8uMiUvadWAEMTH/rpc?token=af5dfa0a0b4a7f53c0b12762708c72fcee5138d2ef0a0771a77fb6db8f4f2385
### chainId: 7158
npx hardhat run script/deploy.ts --network avacloud_testnet
## Mainnet環境（未構築）
# npx hardhat run script/deploy.ts --network avacloud_mainnet
```

## スマートコントラクト説明

- ### セキュリティトークン公開

  コントラクト名：StRelease.sol<br>
  呼出権限：スマートコントラクト所有者アドレス/当該のSPCアドレス<br>
  コントラクトアドレス（Testnet環境）：0x5423b03593Fcf7549098E3D091e1FD3E605abff9<br>

- ### セキュリティトークンオファリング公開
  コントラクト名：StoRelease.sol<br>
  呼出権限：スマートコントラクト所有者アドレス/当該のSPCアドレス<br>
  コントラクトアドレス（Testnet環境）：0x51907951b27db98d43F5d2Dc31C8035a74B9Ea0D<br>
  
- ### セキュリティトークン発行

  コントラクト名：StIssue.sol<br>
  呼出権限：スマートコントラクト所有者アドレス/当該のSPCアドレス<br>
  コントラクトアドレス（Testnet環境）：0x73bbE7e7f6F057fb87265AAeBeE65649af0B3C87<br>

- ### セキュリティトークン移転

  コントラクト名：StTransfer.sol<br>
  呼出権限：スマートコントラクト所有者アドレス/当該のSPCアドレス/移転元投資家アドレス<br>
  コントラクトアドレス（Testnet環境）：0x798Ff8770F20ea1dA82980d4D15BEbE593814a9D<br>

- ### セキュリティトークン償還

  コントラクト名：StRepayment.sol<br>
  呼出権限：スマートコントラクト所有者アドレス/当該のSPCアドレス<br>
  コントラクトアドレス（Testnet環境）：0x0eD1a3FFa2de3b37616ECA34eD606366BAf751D6<br>



## 備考

初期開発時の各バージョンは以下の通り。

- ### solidity バージョン：0.8.17

  [TokenySolutions/T-REX(4.1.5)](https://github.com/TokenySolutions/T-REX) に合わせるため 0.8.17 を使用する

- ### hardhat バージョン：2.19.2

- ### ethers バージョン：^5.7.2

- ### openzeppelin バージョン：^4.8.3

  [TokenySolutions/T-REX(4.1.5)](https://github.com/TokenySolutions/T-REX) に合わせるため ^4.8.3 を使用する

  セキュリティ対策として、openzeppelin-solidity/contracts/ownership/Ownable.sol の onlyOwner を使用する

  コントラクトの改修が必要になった場合を想定して、openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol を親コントラクトとして使用する
