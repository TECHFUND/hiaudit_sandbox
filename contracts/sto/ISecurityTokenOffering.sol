// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { ITokenHolder } from "../holder/ITokenHolder.sol";

/**
 * @notice 前身のPolymathとの互換機能。
 */
interface ISecurityTokenOffering {

    /**
     * @notice STOを初期化する
     * @param symbol_ トークンのシンボル
     * @param spcAddress_ SPCのウォレットアドレス
     * @param rate_ STOのレート
     * @param securityTokenAddress_ セキュリティトークンのアドレス
     * @param tokenHolderFactoryAddress_ トークンホルダファクトリのアドレス
     */
    function initialize(
        string calldata symbol_,
        address spcAddress_,
        // uint256 startDate_,
        // uint256 endDate_,
        // uint256 cap_,
        uint256 rate_,
        // uint8 fundRaiseType_,
        // bool isPaused_,
        // bool isFinalized_,
        address securityTokenAddress_,
        address tokenHolderFactoryAddress_
    ) external;

    /**
     * @notice このSTOで取引するトークンの保有者情報を追加する
     * @param params TokenHolderParams
     * @return トークンホルダのコントラクトアドレス
     */
    function modifyTokenHolder(ITokenHolder.TokenHolderParams calldata params) external returns (address);

    /**
     * @notice STOにてセキュリティトークンを購入する
     * @param tokenHolderAddress トークンホルダのコントラクトアドレス
     * @param amount トークン購入量
     */
    function purchase(address tokenHolderAddress, uint256 amount) external;

    /**
     * @notice STOにてセキュリティトークンを移転する
     * @param fromAddress 移転元TokenHolderのコントラクトアドレス
     * @param toAddress 移転先TokenHolderのコントラクトアドレス
     * @param amount トークン移転量
     */
    function transfer(address fromAddress, address toAddress, uint256 amount) external;

    /**
     * @notice STOにてセキュリティトークンを強制移転する
     * @param fromAddress 移転元TokenHolderのコントラクトアドレス
     * @param toAddress 移転先TokenHolderのコントラクトアドレス
     * @param amount トークン移転量
     */
    function forcedTransfer(address fromAddress, address toAddress, uint256 amount) external;

    /**
     * @notice STOにてセキュリティトークンを償還する
     * @param tokenHolderAddress トークンホルダのコントラクトアドレス
     * @param amount トークン償還量
     */
    function redeem(address tokenHolderAddress, uint256 amount) external;

    struct StoAttributes {
        string symbol;
        // uint256 startDate;
        // uint256 endDate;
        // uint256 cap;
        uint256 rate;
        uint256 raisedAmount;
        uint256 soldTokensAmount;
        uint256 investorCount;
        // bool isPaused;
        // bool isFinalized;
        address contractAddress;
    }

    /**
     * @notice STOとして保持する属性値を取得する
     * @return STO属性情報
     */
    function value() external view returns(StoAttributes memory);

    /**
     * @notice STOとして保持する全トークンホルダを取得する
     */
    function allTokenHolders() external view returns(address[] memory);

    /**
     * @notice 投資家のウォレットアドレスからトークンホルダのコントラクトアドレスを取得する
     * @param investorWallet 投資家のウォレットアドレス
     * @return トークンホルダのコントラクトアドレス
     */
    function tokenHolder(address investorWallet) external view returns (address);

}
