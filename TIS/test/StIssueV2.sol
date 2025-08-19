// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { StIssue, InvalidExecutor } from "../biz/StIssue.sol";
import { ITokenHolder } from "../holder/ITokenHolder.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";

/* 
 * @notice 【BTC015：ST発行】
 */
contract StIssueV2 is StIssue {

    event StIssuedV2(
        string indexed symbol,
        address indexed spcAddress,
        address stoAddress,
        address indexed investor,
        uint256 amount,
        address executor);

    /**
     * @notice ST発行
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StIssueParams
     */
    function issue(StIssueParams calldata params) external override onlyController(params) whenNotPaused {
        // STOを取得
        ISecurityTokenOffering sto = ISecurityTokenOffering(params.stoAddress);

        // トークンホルダの更新
        address tokenHolderAddress;
        if (params.addPermissionList) {
            tokenHolderAddress = sto.modifyTokenHolder(
                ITokenHolder.TokenHolderParams({
                    symbol: params.symbol,
                    spcAddress: params.spcAddress,
                    walletAddress: params.investor,
                    timeCanReceiveAfter: params.timeCanReceiveAfter,
                    timeCanSendAfter: params.timeCanSendAfter,
                    kycExpiry: params.kycExpiry,
                    canBuyFromSto: params.canBuyFromSto
            }));
        } else {
            tokenHolderAddress = sto.tokenHolder(params.investor);
        }

        // 取得したSTOをもとに発行
        sto.purchase(tokenHolderAddress, params.amount);

        emit StIssuedV2(params.symbol, params.spcAddress, params.stoAddress, params.investor, params.amount, _msgSender());
    }
}
