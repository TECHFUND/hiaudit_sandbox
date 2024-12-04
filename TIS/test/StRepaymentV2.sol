// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { StRepayment, InvalidTrexGatewayAddress } from "../biz/StRepayment.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";
import { IStoRegistry } from "../sto/IStoRegistry.sol";

/* 
 * @notice 【BTC016：ST償還】
 */
contract StRepaymentV2 is StRepayment {

    event StRepayedV2(
        string indexed symbol,
        address indexed spcAddress,
        address indexed from,
        uint256 amount,
        address executor);

    /**
     * @notice ST償還
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StRepaymentParams
     */
    function repay(StRepaymentParams calldata params) external override onlyController(params) whenNotPaused {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }
        // STOを取得
        ISecurityTokenOffering sto = getSto(params);

        // 取得したSTOをもとに償還
        address tokenHolderAddress = sto.tokenHolder(params.from);
        sto.redeem(tokenHolderAddress, params.amount);

        emit StRepayedV2(params.symbol, params.spcAddress, params.from, params.amount, _msgSender());
    }
}
