// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IIdentity } from "@onchain-id/solidity/contracts/interface/IIdentity.sol";

interface ITokenHolder {

    event TokenHolderUpdated(
        string indexed symbol,
        address indexed spcAddress,
        address indexed walletAddress,
        uint64 timeCanReceiveAfter,
        uint64 timeCanSendAfter,
        uint64 kycExpiry,
        bool canBuyFromSto,
        address tokenHolderContractAddress
    );

    struct TokenHolderParams {
        string symbol;
        address spcAddress;
        address walletAddress;
        uint64 timeCanReceiveAfter;
        uint64 timeCanSendAfter;
        uint64 kycExpiry;
        bool canBuyFromSto;
    }

    /**
     * @notice 初期化
     * @param spcAddress トークンホルダの初期管理キー
     */
    function initialize(address spcAddress) external;

    /**
     * @notice トークンホルダ内のパラメータ更新
     * @param params TokenHolderParams
     */
    function update(TokenHolderParams calldata params) external;

    /**
     * @notice ホールド対象のトークンシンボルを取得
     * @return address ホールド対象のトークンシンボル
     */
    function symbol() external view returns (string memory);

    /**
     * @notice 権限管理用アドレス（SPCアドレス）を取得
     * @return address 権限管理用アドレス（SPCアドレス）
     */
    function spcAddress() external view returns (address);
    /**
     * @notice ウォレットアドレスを取得
     * @return address ウォレットアドレス
     */
    function walletAddress() external view returns (address);

    /**
     * @notice トークンを受け取ることができるようになる日付を取得
     * @return uint64 受取可能となる日時（UNIXタイムスタンプ）
     */
    function timeCanReceiveAfter() external view returns (uint64);

    /**
     * @notice トークンを移転できるようになる日付を取得
     * @return uint64 移転可能となる日時（UNIXタイムスタンプ）
     */
    function timeCanSendAfter() external view returns (uint64);

    /**
     * @notice KYCの有効期限を取得
     * @return uint64 KYCの有効期限（UNIXタイムスタンプ）
     */
    function kycExpiry() external view returns (uint64);

    /**
     * @notice STOからの購入可否を取得
     * @return bool STOからの購入可否
     */
    function canBuyFromSto() external view returns (bool);

    /**
     * @notice KYCが手動で取り消されているか否か
     * @return bool KYC取り消し有無
     */
    function isRevoked() external view returns (bool);

    /**
     * @notice ONCHAINIDを取得
     * @return bool ONCHAINID
     */
    function onchainId() external view returns (IIdentity);
}