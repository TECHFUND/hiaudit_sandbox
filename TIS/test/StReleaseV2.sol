// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { StRelease, InvalidTrexGatewayAddress } from "../biz/StRelease.sol";
import { ISTLinkTREXGateway } from "../overrides/ISTLinkTREXGateway.sol";
import { ISTLinkToken } from "../overrides/ISTLinkToken.sol";

/* 
 * @notice 【BTC006：ST公開】
 */
contract StReleaseV2 is StRelease {
    event StReleasedV2(
        string indexed symbol,
        address indexed spcAddress,
        address newSecurityTokenAddress,
        address executor);
    
    /**
     * @notice ST公開
     * @dev OpenzeppelinのUpgradeable準拠
     * @param params StReleaseParams
     * @return newSecurityTokenAddress セキュリティトークンアドレス
     */
    function release(StReleaseParams calldata params) external override onlyController(params) whenNotPaused returns (address newSecurityTokenAddress) {
        if (_trexGatewayAddress == address(0)) {
            revert InvalidTrexGatewayAddress(_trexGatewayAddress);
        }

        ISTLinkTREXGateway trexGateway = ISTLinkTREXGateway(_trexGatewayAddress);

        // SPCアドレスをエージェントに設定（SPCアドレスに対してSTの強制移転をする権限を付与）
        address[] memory agentsArray = new address[](1);
        agentsArray[0] = params.spcAddress;

        // セキュリティトークンのデプロイ
        newSecurityTokenAddress = trexGateway.deploySTLinkTREXSuite(params.symbol, params.spcAddress, agentsArray);
        ISTLinkToken token = ISTLinkToken(newSecurityTokenAddress);

        emit StReleasedV2(token.symbol(), params.spcAddress, newSecurityTokenAddress, _msgSender());
    }
}
