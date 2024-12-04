// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { StTransfer, InvalidTrexGatewayAddress } from "../biz/StTransfer.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";
import { ITokenHolder } from "../holder/ITokenHolder.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";
import { IStoRegistry } from "../sto/IStoRegistry.sol";

/* 
 * @notice 【BTC010：ST移転】
 */
contract StTransferV2 is StTransfer {
    
    event StTransferedV2(
        string indexed symbol,
        address spcAddress,
        address indexed from,
        address indexed to,
        uint256 amount,
        address executor);

    /**
     * @notice ST移転
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StTransferParams
     */
    function transfer(StTransferParams calldata params) external override onlyController(params) whenNotPaused {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }
        // STOを取得
        ISecurityTokenOffering sto = getSto(params);

        // 移転先トークンホルダの更新
        address toTokenHolderAddress;
        if (params.addPermissionList) {
            toTokenHolderAddress = sto.modifyTokenHolder(
                ITokenHolder.TokenHolderParams({
                    symbol: params.symbol,
                    spcAddress: params.spcAddress,
                    walletAddress: params.to,
                    timeCanReceiveAfter: params.timeCanReceiveAfter,
                    timeCanSendAfter: params.timeCanSendAfter,
                    kycExpiry: params.kycExpiry,
                    canBuyFromSto: params.canBuyFromSto
            }));
        } else {
            toTokenHolderAddress = sto.tokenHolder(params.to);
        }

        // STO（TokenHolderの属性）を元に移転
        sto.transfer(sto.tokenHolder(params.from), toTokenHolderAddress, params.amount);

        emit StTransferedV2(params.symbol, params.spcAddress, params.from, params.to, params.amount, _msgSender());
    }
}
