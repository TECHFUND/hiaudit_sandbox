// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";
import { ISTLinkToken } from "../overrides/ISTLinkToken.sol";

error InvalidExecutor(address senderAddress);
error InvalidTrexGatewayAddress(address invalidAddress);

/* 
 * @notice 【BTC006：ST公開】
 */
contract StRelease is AbstractUpgradeable {
    // T-REXのデプロイ管理コントラクト
    address internal _trexGatewayAddress;

    event StReleased(
        string indexed symbol,
        address indexed spcAddress,
        address newSecurityTokenAddress);

    struct StReleaseParams {
        string symbol;
        address spcAddress;
    }

    /**
     * @notice ownerまたはSPCアドレスのみ実行可
     * @param params StIssueParams
     */
    modifier onlyController(StReleaseParams calldata params) {
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
     * @notice ST公開
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StReleaseParams
     * @return stAddress セキュリティトークンアドレス
     */
    function release(StReleaseParams calldata params) external virtual onlyController(params) whenNotPaused returns (address stAddress) {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }

        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);

        // SPCアドレスをエージェントに設定（SPCアドレスに対してSTの強制移転をする権限を付与）
        address[] memory agentsArray = new address[](1);
        agentsArray[0] = params.spcAddress;

        // セキュリティトークンのデプロイ
        stAddress = trexGateway.deploySTLinkTREXSuite(params.symbol, params.spcAddress, agentsArray);
        ISTLinkToken token = ISTLinkToken(stAddress);

        emit StReleased(token.symbol(), params.spcAddress, stAddress);
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
