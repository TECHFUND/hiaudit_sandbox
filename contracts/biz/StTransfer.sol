// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";
import { ITokenHolder } from "../holder/ITokenHolder.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";
import { IStoRegistry } from "../sto/IStoRegistry.sol";

error InvalidExecutor(address senderAddress);
error InvalidTrexGatewayAddress(address invalidAddress);
error SecurityTokenOfferingNotCreated(address stoAddress);

/* 
 * @notice 【BTC010：ST移転】
 */
contract StTransfer is AbstractUpgradeable {
    // T-REXのデプロイ管理コントラクト
    address internal _trexGatewayAddress;

    event StTransfered(
        string indexed symbol,
        address spcAddress,
        address indexed from,
        address indexed to,
        uint256 amount);

    struct StTransferParams {
        string symbol;
        address spcAddress;
        bool addPermissionList;
        address from;
        address to;
        uint256 amount;
        uint64 timeCanReceiveAfter;
        uint64 timeCanSendAfter;
        uint64 kycExpiry;
        bool canBuyFromSto;
    }

    /**
     * @notice ownerまたはSPCアドレスまたは移転元アドレスのみ実行可
     * @param params StIssueParams
     */
    modifier onlyController(StTransferParams calldata params) {
        address sender = _msgSender();
        if (sender != owner() && sender != params.spcAddress && sender != params.from) {
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
     * @notice ST移転
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StTransferParams
     */
    function transfer(StTransferParams calldata params) external virtual onlyController(params) whenNotPaused {
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

        emit StTransfered(params.symbol, params.spcAddress, params.from, params.to, params.amount);
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
     * @param params StTransferParams
     * @return STO
     */
    function getSto(StTransferParams calldata params) internal virtual view returns(ISecurityTokenOffering) {
        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);
        IStoRegistry stoRegistry = IStoRegistry(trexGateway.stoRegistry());
        address stoAddress = stoRegistry.getSto(params.spcAddress, params.symbol);
        if (stoAddress == address(0)) {
            revert SecurityTokenOfferingNotCreated(stoAddress);
        }
        return ISecurityTokenOffering(stoAddress);
    }
}
