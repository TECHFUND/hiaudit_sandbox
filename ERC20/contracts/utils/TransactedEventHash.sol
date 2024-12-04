// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

abstract contract TransactedEventHash is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    event SetTransactedEventHash(bytes32 _eventHash, bool _desired);

    mapping(bytes32 => bool) private transactedEventHash;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    function isTransactedEventHash(bytes32 _eventHash)
        virtual
        public
        view
        returns (bool)
    {
        return transactedEventHash[_eventHash];
    }

    function setTransactedEventHash(bytes32 _eventHash, bool _desired)
        virtual
        public
        onlyRole(OPERATOR_ROLE)
    {
        transactedEventHash[_eventHash] = _desired;
        emit SetTransactedEventHash(_eventHash, _desired);
    }
}

