// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IERC20Gateway {
  function isTransactedEventHash(
    bytes32 _eventHash
  ) external view returns (bool);

  function setTransactedEventHash(bytes32 _eventHash, bool _desired) external;

  function transfer(
    address _assetContract,
    address _from,
    address _to,
    uint256 _valueOrTokenId,
    bytes32 _eventHash
  ) external;
}
