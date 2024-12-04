// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { SecurityTokenOffering } from "./SecurityTokenOffering.sol";
import { ISecurityTokenOffering } from "./ISecurityTokenOffering.sol";
import { IStoRegistry } from "./IStoRegistry.sol";
import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";

error TokenAlreadyDeployed(address existingAddress, address spcAddress, string symbol);

contract StoRegistry is IStoRegistry, AbstractUpgradeable {
    // SPCアドレス/シンボルをキーとしてSTOアドレスのリストを保存するマッピング
    mapping(address => mapping(string => address[])) internal _stos;

    /**
     * @notice 初期化処理
     * @dev Openzeppelin準拠のUpgradeable用function
     */
    function initialize() external initializer {
        __AbstractUpgradeable_init();
    }

    /**
     * @notice STOを生成してレジストリに登録する
     * @param symbol トークンのシンボル
     * @param spcAddress SPCのアドレス
     * @return address 生成されたSTOのアドレス
     */
    function createSto(
        string calldata symbol,
        address spcAddress
    ) external virtual whenNotPaused returns (address) {
        if (_stos[spcAddress][symbol].length != 0) {
            revert TokenAlreadyDeployed(_stos[spcAddress][symbol][0], spcAddress, symbol);
        }
        // STOを生成
        ISecurityTokenOffering sto = new SecurityTokenOffering();

        // STOをレジストリに登録
        address stoAddress = address(sto);
        _stos[spcAddress][symbol].push(stoAddress);

        return stoAddress;
    }

    /**
     * @notice 特定のSPCに紐付くすべてのSTOのリストを取得
     * @param spcAddress SPCのアドレス
     * @param symbol トークンのシンボル
     * @return STO属性情報の配列
     */
    function getStos(address spcAddress, string calldata symbol) external virtual view returns (address[] memory) {
        return _stos[spcAddress][symbol];
    }

    /**
     * @notice 特定のSPCとシンボルに紐付くSTOを取得
     * @param spcAddress SPCのアドレス
     * @param symbol セキュリティトークンのシンボル
     * @return address STOアドレス
     */
    function getSto(address spcAddress, string calldata symbol) external virtual view returns (address) {
        address[] memory stos = _stos[spcAddress][symbol];
        if (stos.length == 0) {
            return address(0); // STOが見つからない場合
        }
        return stos[0];
    }
}
