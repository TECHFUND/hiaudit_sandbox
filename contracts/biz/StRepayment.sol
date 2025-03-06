// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";
import { IStoRegistry } from "../sto/IStoRegistry.sol";

error InvalidExecutor(address senderAddress);
error InvalidTrexGatewayAddress(address invalidAddress);
error InvalidStoAddress(address stoAddress);

/* 
 * @notice 【BTC016：ST償還】
 */
contract StRepayment is AbstractUpgradeable {
    // T-REXのデプロイ管理コントラクト
    address internal _trexGatewayAddress;

    event StRepayed(
        string indexed symbol,
        address indexed spcAddress,
        address indexed from,
        uint256 amount);

    struct StRepaymentParams {
        string symbol;
        address spcAddress;
        address from;
        uint256 amount;
    }

    /**
     * @notice ownerまたはSPCアドレスのみ実行可
     * @param params StIssueParams
     */
    modifier onlyController(StRepaymentParams calldata params) {
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
     * @notice ST償還
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StRepaymentParams
     */
    function repay(StRepaymentParams calldata params) external virtual onlyController(params) whenNotPaused {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }
        // STOを取得
        ISecurityTokenOffering sto = getSto(params);

        // 取得したSTOをもとに償還
        address tokenHolderAddress = sto.tokenHolder(params.from);
        sto.redeem(tokenHolderAddress, params.amount);

        emit StRepayed(params.symbol, params.spcAddress, params.from, params.amount);
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

    /**
     * @notice STO取得
     * @param params StRepaymentParams
     * @return STO
     */
    function getSto(StRepaymentParams calldata params) internal virtual view returns(ISecurityTokenOffering) {
        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);
        IStoRegistry stoRegistry = IStoRegistry(trexGateway.stoRegistry());
        address stoAddress = stoRegistry.getSto(params.spcAddress, params.symbol);
        if (stoAddress == address(0)) {
            revert InvalidStoAddress(stoAddress);
        }
        return ISecurityTokenOffering(stoAddress);
    }
}
