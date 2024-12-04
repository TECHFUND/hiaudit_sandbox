// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";
import { ITokenHolder } from "../holder/ITokenHolder.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";

error InvalidExecutor(address senderAddress);

/* 
 * @notice 【BTC015：ST発行】
 */
contract StIssue is AbstractUpgradeable {

    event StIssued(
        string indexed symbol,
        address indexed spcAddress,
        address stoAddress,
        address indexed investor,
        uint256 amount);

    struct StIssueParams {
        string symbol;
        address spcAddress;
        bool addPermissionList;
        address stoAddress;
        address investor;
        uint256 amount;
        uint64 timeCanReceiveAfter;
        uint64 timeCanSendAfter;
        uint64 kycExpiry;
        bool canBuyFromSto;
    }

    /**
     * @notice ownerまたはSPCアドレスのみ実行可
     * @param params StIssueParams
     */
    modifier onlyController(StIssueParams calldata params) {
        address sender = _msgSender();
        if (sender != owner() && sender != params.spcAddress) {
            revert InvalidExecutor(_msgSender());
        }
        _;
    }

    /**
     * @notice 初期化処理
     * @dev Openzeppelin準拠のUpgradeable用function
     */
    function initialize() external initializer {
        __AbstractUpgradeable_init();
    }

    /**
     * @notice ST発行
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StIssueParams
     */
    function issue(StIssueParams calldata params) external virtual onlyController(params) whenNotPaused {
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

        emit StIssued(params.symbol, params.spcAddress, params.stoAddress, params.investor, params.amount);
    }
}
