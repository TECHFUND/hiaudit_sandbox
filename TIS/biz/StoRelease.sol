// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";
import { IStoRegistry } from "../sto/IStoRegistry.sol";
import { ISecurityTokenOffering } from "../sto/ISecurityTokenOffering.sol";
import { ISTLinkTREXFactory } from "../overrides/ISTLinkTREXFactory.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";

error InvalidExecutor(address senderAddress);
error InvalidTrexGatewayAddress(address invalidAddress);
error SecurityTokenOfferingNotCreated();

/* 
 * @notice 【BTC017：STO公開】
 */
contract StoRelease is AbstractUpgradeable {
    // T-REXのデプロイ管理コントラクト
    address internal _trexGatewayAddress;

    event StoReleased(
        string indexed symbol,
        address indexed spcAddress,
        uint256 rate,
        address newSecurityTokenAddress);

    struct StoReleaseParams {
        string symbol;
        address spcAddress;
        uint256 rate;
    }

    /**
     * @notice ownerまたはSPCアドレスのみ実行可
     * @param params StIssueParams
     */
    modifier onlyController(StoReleaseParams calldata params) {
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
     * @notice STO公開
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StoReleaseParams
     * @return stoAddress STOアドレス
     */
    function release(StoReleaseParams calldata params) external virtual onlyController(params) whenNotPaused returns (address stoAddress) {
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

        emit StoReleased(params.symbol, params.spcAddress, params.rate, stoAddress);
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
