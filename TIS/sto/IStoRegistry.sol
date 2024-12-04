// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IStoRegistry {

    /**
     * @notice STOを生成してレジストリに登録する
     * @param symbol トークンのシンボル
     * @param spcAddress SPCのアドレス
     * @return address 生成されたSTOのアドレス
     */
    function createSto(string calldata symbol, address spcAddress) external returns (address);

    /**
     * @notice 特定のSPCに紐付くすべてのSTOのリストを取得
     * @param spcAddress SPCのアドレス
     * @param symbol トークンのシンボル
     * @return STO属性情報の配列
     */
    function getStos(address spcAddress, string calldata symbol) external view returns (address[] memory);

    /**
     * @notice 特定のSPCとセキュリティトークンに関連するSTOのリストを取得
     * @param spcAddress SPCのアドレス
     * @param symbol セキュリティトークンのシンボル
     * @return address[] STOアドレスの配列
     */
   function getSto(address spcAddress, string calldata symbol) external view returns (address);
}