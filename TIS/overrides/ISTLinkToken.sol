// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IToken } from "@tokenysolutions/t-rex/contracts/token/IToken.sol";

interface ISTLinkToken is IToken {

    /**
     * @notice セキュリティトークンのowner（トークン管理用のSTOコントラクト）を設定する
     * @param stoAddress トークン管理用STOのコントラクトアドレス
     */
    function setAdminSto(address stoAddress) external;

    /**
     * @notice セキュリティトークンのowner（トークン管理用のSTOコントラクト）を取得する
     * @return トークン管理用STOのコントラクトアドレス
     */
    function adminSto() external view returns(address);

    /**
     * @notice TreasuryWalletのIdentityを格納するトークンホルダのコントラクトアドレスを設定する
     * @param holderAddress TreasuryWalletのトークンホルダアドレス
     */
    function setTreasuryTokenHolder(address holderAddress) external;

    /**
     * @notice TreasuryWalletのIdentityを格納するトークンホルダのコントラクトアドレスを取得する
     * @return TreasuryWalletのトークンホルダアドレス
     */
    function treasuryTokenHolder() external view returns(address);

    /**
     * @notice セキュリティトークンの転送（発行を含む）の凍結/凍結解除を設定する
     * @param transfersFrozen_ true:凍結、false：凍結解除
     */
    function setTransfersFrozen(bool transfersFrozen_) external;

    /**
     * @notice セキュリティトークンの転送（発行を含む）の凍結/凍結解除を取得する
     * @return true:凍結、false：凍結解除
     */
    function transfersFrozen() external view returns(bool);

    /**
     * @notice セ発行許可の有無を設定する
     * @param issuanceAllowed_ 発行許可の有無
     */
    function setIssuanceAllowed(bool issuanceAllowed_) external;

    /**
     * @notice 発行許可の有無を取得する
     * @return 発行許可の有無
     */
    function isIssuanceAllowed() external view returns(bool);

    /**
     * @notice allowance量を増額する
     * @param spender トークンの移転元ウォレットアドレス
     * @param addedValue 増額するallowance量
     */
    function addAllowance(address spender, uint256 addedValue) external returns (bool);
}
