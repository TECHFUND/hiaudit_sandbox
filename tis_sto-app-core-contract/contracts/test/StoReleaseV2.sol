// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { StoRelease, InvalidTrexGatewayAddress, SecurityTokenOfferingNotCreated } from "../biz/StoRelease.sol";
import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";
import { IStoRegistry } from "../sto/IStoRegistry.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";
import { ISTLinkTREXFactory } from "../overrides/ISTLinkTREXFactory.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";

/* 
 * @notice 【BTC017：STO公開】
 */
contract StoReleaseV2 is StoRelease {
    
    event StoReleasedV2(
        string indexed symbol,
        address indexed spcAddress,
        uint256 rate,
        address newSecurityTokenAddress,
        address executor);

    /**
     * @notice STO公開
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StoReleaseParams
     */
    function release(StoReleaseParams calldata params) external override onlyController(params) whenNotPaused returns (address stoAddress) {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }
        // セキュリティトークンアドレスの取得
        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);
        ISTLinkTREXFactory trexFactory = ISTLinkTREXFactory(trexGateway.getFactory());
        address securityTokenAddress = trexFactory.getDeployedToken(params.spcAddress, params.symbol);

        // STOを初期化（公開）
        IStoRegistry stoRegistry = IStoRegistry(trexGateway.stoRegistry());
        stoAddress = stoRegistry.getSto(params.spcAddress, params.symbol);
        if (stoAddress == address(0)) {
            revert SecurityTokenOfferingNotCreated();
        }
        ISecurityTokenOffering(stoAddress).initialize(params.symbol, params.spcAddress, params.rate,
                securityTokenAddress, trexGateway.tokenHolderFactory());
        // biz配下のコントラクトとownerを合わせる：OwnableUpgradeable(stoAddress)の代替
        AbstractUpgradeable(stoAddress).transferOwnership(_msgSender());

        emit StoReleasedV2(params.symbol, params.spcAddress, params.rate, stoAddress, _msgSender());
    }
}
