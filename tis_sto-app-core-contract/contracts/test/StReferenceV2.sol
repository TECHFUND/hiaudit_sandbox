// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { StReference, InvalidTrexGatewayAddress } from "../biz/StReference.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";
import { ISTLinkTREXFactory } from "../overrides/ISTLinkTREXFactory.sol";
import { ISTLinkToken } from "../overrides/ISTLinkToken.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";
import { IStoRegistry } from "../sto/IStoRegistry.sol";
import { TokenHolder } from "../holder/TokenHolder.sol";

/** 
 * @notice 【ST関連情報参照】
 */
contract StReferenceV2 is StReference {

    /**
     * @notice STリスト取得
     * @param spcAddress SPCのウォレットアドレス
     * @return SecurityTokenリスト
     */
    function getSecurityTokens(address spcAddress) external override view returns (SecurityTokenAttributes[] memory) {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }

        // SPCに紐づく全セキュリティトークンのアドレスを取得
        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);
        address[] memory stList = ISTLinkTREXFactory(trexGateway.getFactory()).getSecurityTokens(spcAddress);

        // セキュリティトークン数分の構造体配列を生成
        SecurityTokenAttributes[] memory tokenAttributes = new SecurityTokenAttributes[](stList.length + 1);
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
    function getTokenHolders(string calldata symbol, address spcAddress) external override view returns (TokenHolderAttributes[] memory) {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }

        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);
        address[] memory stoList = IStoRegistry(trexGateway.stoRegistry()).getStos(spcAddress, symbol);
        TokenHolderAttributes[] memory tokenHolderAttributes = new TokenHolderAttributes[](0);

        if (stoList.length > 0) {
            address tokenAddress = ISTLinkTREXFactory(trexGateway.getFactory()).getDeployedToken(spcAddress, symbol);
            address[] memory tokenHolderList = ISecurityTokenOffering(stoList[0]).allTokenHolders();
            tokenHolderAttributes = new TokenHolderAttributes[](tokenHolderList.length + 1);

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
    function getStos(string calldata symbol, address spcAddress) external override view returns (ISecurityTokenOffering.StoAttributes[] memory) {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }

        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);
        address[] memory stoList = IStoRegistry(trexGateway.stoRegistry()).getStos(spcAddress, symbol);

        // セキュリティトークン数分の構造体配列を生成
        ISecurityTokenOffering.StoAttributes[] memory tokenAttributes = new ISecurityTokenOffering.StoAttributes[](stoList.length + 1);
        for (uint256 i = 0; i < stoList.length;) {
            tokenAttributes[i] = ISecurityTokenOffering(stoList[i]).value();
            unchecked { i++; }
        }
        return tokenAttributes;
    }
}
