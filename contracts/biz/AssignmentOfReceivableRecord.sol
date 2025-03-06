// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";

/* 
 * @notice 【BTC022：債権譲渡通知・承諾登録】
 */
contract AssignmentOfReceivableRecord is AbstractUpgradeable {

    event RecordSet(
        string id,
        string stContractAddres,
        string from,
        string to,
        uint256 amount,
        string fixedDate
    );

    struct Record {
        // 債権譲渡通知バッチから渡されるパラメータ
        string id;
        string stContractAddress;
        string from;
        string to;
        uint256 amount;
        string fixedDate;
        // 債権譲渡通知idの登録状況を判別するフラグ
        bool isUsed;
    }

    mapping(bytes32 => Record) public _recordList;

    string[] public _idList;

    /**
     * @notice 初期化処理
     * @dev Openzeppelin準拠のUpgradeable用function
     */
    function initialize() external initializer {
        __AbstractUpgradeable_init();
    }

    /**
     * @notice 債権譲渡通知・承諾日時登録
     */
    function setRecord(string calldata id_, string calldata stContractAddres_, string calldata from_,
            string calldata to_, uint256 amount_, string calldata fixedDate_) external onlyOwner {
        bytes32 key = keccak256(bytes(id_));

        // パラメータチェック、詳細は設計書に参照
        require(!_recordList[key].isUsed, "Already exist id");
        require(key != keccak256(bytes("")), "Empty id");
        require(keccak256(bytes(stContractAddres_)) != keccak256(bytes("")), "Empty stContractAddres");
        require(keccak256(bytes(from_)) != keccak256(bytes("")), "Empty from");
        require(keccak256(bytes(to_)) != keccak256(bytes("")), "Empty to");
        require(amount_ > 0, "amount 0");
        require(keccak256(bytes(fixedDate_)) != keccak256(bytes("")), "Empty fixedDate");
        
        // 債権譲渡通知・承諾日時登録処理
        Record memory record;
        record = Record(id_, stContractAddres_, from_, to_, amount_, fixedDate_, true);
        _recordList[key] = record;
        _idList.push(id_);

        emit RecordSet( id_, stContractAddres_, from_, to_, amount_, fixedDate_);
    }

    /**
     * @notice 債権譲渡通知・承諾日時情報取得
     */
    function getRecord(string calldata id_) external view returns(string memory, string memory, string memory, uint256, string memory) {
        bytes32 key = keccak256(bytes(id_));

        // パラメータチェック、詳細は設計書に参照
        require(_recordList[key].isUsed, "Invalid id");
        require(key != keccak256(bytes("")), "Empty id");

        // 債権譲渡通知・承諾日時情報取得処理
        Record memory record;
        record = _recordList[key];
        return (record.stContractAddress, record.from, record.to, record.amount, record.fixedDate);
    }

    /**
     * @notice 債権譲渡通知id一覧情報取得
     */
    function listIds() external view returns(string[] memory) {
        uint256 idListLength = _idList.length;
        string[] memory idListMemory = new string[](idListLength);
        idListMemory = _idList;
        return idListMemory;
    }
}
