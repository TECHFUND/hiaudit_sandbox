// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";
import { ISTLinkTREXFactory } from "../overrides/ISTLinkTREXFactory.sol";
import { ISTLinkToken } from "../overrides/ISTLinkToken.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";
import { IStoRegistry } from "../sto/IStoRegistry.sol";
import { TokenHolder } from "../holder/TokenHolder.sol";

error InvalidTrexGatewayAddress(address invalidAddress);

/** 
 * @notice 【ST関連情報参照】
 */
contract StReference is AbstractUpgradeable {
    // T-REXのデプロイ管理コントラクト
    address internal _trexGatewayAddress;

    // ST情報
    struct SecurityTokenAttributes {
        string symbol;          // トークンのシンボル
        address contractAddr;   // コントラクトアドレス
        uint256 totalSupply;    // 総発行口数
        address treasuryWallet; // SPCのウォレットアドレス
        bool frozen;            // ST移転凍結フラグ
        bool allowed;           // ST発行許可フラグ
    }

    // 保有者情報
    struct TokenHolderAttributes {
        uint256 balance;        // 保有ST数
        address walletAddress;  // 保有者のウォレットアドレス
        bool canBuyFromSto;     // STO購買可否
        uint64 canSendAfter;    // 売却ロックアップ解除日時
        uint64 canReceiveAfter; // 購入ロックアップ解除日時
        uint64 kycExpiry;       // KYC有効期限
        bool isRevoked;         // 取り消しフラグ
    }

    /**
     * @notice 初期化処理
     * @dev Openzeppelin準拠のUpgradeable用function
     */
    function initialize() external initializer {
        __AbstractUpgradeable_init();
    }

    /**
     * @notice STリスト取得
     * @param spcAddress SPCのウォレットアドレス
     * @return SecurityTokenリスト
     */
    function getSecurityTokens(address spcAddress) external virtual view returns (SecurityTokenAttributes[] memory) {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }

        // SPCに紐づく全セキュリティトークンのアドレスを取得
        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);
        address[] memory stList = ISTLinkTREXFactory(trexGateway.getFactory()).getSecurityTokens(spcAddress);

        // セキュリティトークン数分の構造体配列を生成
        SecurityTokenAttributes[] memory tokenAttributes = new SecurityTokenAttributes[](stList.length);
        for (uint256 i = 0; i < stList.length;) {
            // コントラクトアドレスをISTLinkTokenとしてラップ
            ISTLinkToken securityToken = ISTLinkToken(stList[i]);

            tokenAttributes[i] = SecurityTokenAttributes({
                symbol: securityToken.symbol(),
                contractAddr: stList[i],
                totalSupply: securityToken.totalSupply(),
                treasuryWallet: spcAddress,
                frozen: securityToken.transfersFrozen(),
                allowed: securityToken.isIssuanceAllowed()
            });
            unchecked { i++; }
        }
        return tokenAttributes;
    }

    /**
     * @notice 保有者リスト取得
     * @param symbol シンボル
     * @param spcAddress SPCのウォレットアドレス
     * @return SecurityToken保有者リスト
     */
    function getTokenHolders(string calldata symbol, address spcAddress) external virtual view returns (TokenHolderAttributes[] memory) {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }

        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);
        address[] memory stoList = IStoRegistry(trexGateway.stoRegistry()).getStos(spcAddress, symbol);
        TokenHolderAttributes[] memory tokenHolderAttributes = new TokenHolderAttributes[](0);

        if (stoList.length > 0) {
            address tokenAddress = ISTLinkTREXFactory(trexGateway.getFactory()).getDeployedToken(spcAddress, symbol);
            address[] memory tokenHolderList = ISecurityTokenOffering(stoList[0]).allTokenHolders();
            tokenHolderAttributes = new TokenHolderAttributes[](tokenHolderList.length);

            for (uint256 i = 0; i < tokenHolderList.length;) {
                TokenHolder tokenHolder = TokenHolder(tokenHolderList[i]);
                address walletAddress = tokenHolder.walletAddress();

                tokenHolderAttributes[i] = TokenHolderAttributes({
                    balance: ISTLinkToken(tokenAddress).balanceOf(walletAddress),
                    walletAddress: walletAddress,
                    canBuyFromSto: tokenHolder.canBuyFromSto(),
                    canSendAfter: tokenHolder.timeCanSendAfter(),
                    canReceiveAfter: tokenHolder.timeCanReceiveAfter(),
                    kycExpiry: tokenHolder.kycExpiry(),
                    isRevoked: tokenHolder.isRevoked()
                });
                unchecked { i++; }
            }
        }
        return tokenHolderAttributes;
    }

    /**
     * @notice STOリスト取得
     * @param symbol シンボル
     * @param spcAddress SPCのウォレットアドレス
     * @return SecurityTokenOfferingリスト
     */
    function getStos(string calldata symbol, address spcAddress) external virtual view returns (ISecurityTokenOffering.StoAttributes[] memory) {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }

        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);
        address[] memory stoList = IStoRegistry(trexGateway.stoRegistry()).getStos(spcAddress, symbol);

        // セキュリティトークン数分の構造体配列を生成
        ISecurityTokenOffering.StoAttributes[] memory tokenAttributes = new ISecurityTokenOffering.StoAttributes[](stoList.length);
        for (uint256 i = 0; i < stoList.length;) {
            tokenAttributes[i] = ISecurityTokenOffering(stoList[i]).value();
            unchecked { i++; }
        }
        return tokenAttributes;
    }

    /**
     * @notice TrexGatewayアドレス設定
     * @dev 要owner権限
     * @param trexGatewayAddress TrexGatewayアドレス
     */
    function setTrexGateway(address trexGatewayAddress) external virtual onlyOwner {
        if (trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(trexGatewayAddress);
        }
        _trexGatewayAddress = trexGatewayAddress;
    }

}
