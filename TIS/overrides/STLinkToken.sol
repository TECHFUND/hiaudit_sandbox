// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { Token } from "@tokenysolutions/t-rex/contracts/token/Token.sol";
import { ISTLinkToken } from "./ISTLinkToken.sol";

error NonAgentMintingAddess(address userAddress);

contract STLinkToken is ISTLinkToken, Token {
    // セキュリティトークンのowner（トークン管理用のSTOコントラクト）
    address internal _adminSto;

    // TreasuryWalletに紐付くトークンホルダ（mint用Identityの格納）
    address internal _treasuryTokenHolder;

    // 償還以外のセキュリティトークンの転送（発行を含む）の凍結/凍結解除（トークン単位）
    bool internal _transfersFrozen;

    // 発行許可の有無
    bool internal _issuanceAllowed;

    /**
     * @notice セキュリティトークンのowner（トークン管理用のSTOコントラクト）を設定
     * @param stoAddress_ トークン管理用STOのコントラクトアドレス
     */
    function setAdminSto(address stoAddress_) external virtual onlyAgent {
        _adminSto = stoAddress_;
    }

    /**
     * @notice セキュリティトークンのowner（トークン管理用のSTOコントラクト）を取得
     * @return トークン管理用STOのコントラクトアドレス
     */
    function adminSto() external view virtual returns(address) {
        return _adminSto;
    }

    /**
     * @notice TreasuryWalletのIdentityを格納するトークンホルダのコントラクトアドレスを設定する
     * @param holderAddress_ TreasuryWalletのトークンホルダアドレス
     */
    function setTreasuryTokenHolder(address holderAddress_) external virtual onlyAgent {
        _treasuryTokenHolder = holderAddress_;
    }

    /**
     * @notice TreasuryWalletのIdentityを格納するトークンホルダのコントラクトアドレスを取得する
     * @return TreasuryWalletのトークンホルダアドレス
     */
    function treasuryTokenHolder() external virtual view returns(address) {
        return _treasuryTokenHolder;
    }

    /**
     * @notice セキュリティトークンの転送（発行を含む）の凍結/凍結解除を設定する
     * @param transfersFrozen_ true:凍結、false：凍結解除
     */
    function setTransfersFrozen(bool transfersFrozen_) external virtual onlyAgent {
        _transfersFrozen = transfersFrozen_;
    }

    /**
     * @notice セキュリティトークンの転送（発行を含む）の凍結/凍結解除を取得する
     * @return true:凍結、false：凍結解除
     */
    function transfersFrozen() external virtual view returns(bool) {
        return _transfersFrozen;
    }

    /**
     * @notice 発行許可の有無を設定する
     * @param issuanceAllowed_ 発行許可の有無
     */
    function setIssuanceAllowed(bool issuanceAllowed_) external virtual onlyAgent {
        _issuanceAllowed = issuanceAllowed_;
    }

    /**
     * @notice 発行許可の有無を取得する
     * @return 発行許可の有無
     */
    function isIssuanceAllowed() external virtual view returns(bool) {
        return _issuanceAllowed;
    }

    /**
     * @notice allowance量を増額する
     * @param spender_ トークンの移転元ウォレットアドレス
     * @param addedValue_ 増額するallowance量
     */
    function addAllowance(address spender_, uint256 addedValue_) external virtual onlyAgent returns (bool) {
        _approve(spender_, msg.sender, _allowances[spender_][msg.sender] + addedValue_);
        return true;
    }

    /**
     * @notice 発行先がトークンのエージェント（通常はSPCアドレスを想定）であることを精査してトークンを発行する
     * @dev See {IToken-_mint}.
     * @param userAddress_ トークンの発行先ウォレットアドレス
     * @param amount_ 発行するトークン量
     */
    function _mint(address userAddress_, uint256 amount_) internal override virtual {
        if (!isAgent(userAddress_)) {
            revert NonAgentMintingAddess(userAddress_);
        }
        super._mint(userAddress_, amount_);
    }
}
