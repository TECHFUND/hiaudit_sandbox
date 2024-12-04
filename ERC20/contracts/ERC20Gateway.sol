// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./interface/IERC20Gateway.sol";
import "./utils/TransactedEventHash.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ERC20Gateway is IERC20Gateway, TransactedEventHash {
  using SafeERC20 for IERC20;
  event TransferEvent(address assetContract, address from, address to, uint256 amount, bytes32 eventHash, bytes data, bool success);

  function transfer(
    address _assetContract,
    address _from,
    address _to,
    uint256 _amount,
    bytes32 _eventHash
  ) public onlyRole(OPERATOR_ROLE) {
    if (isTransactedEventHash(_eventHash)) return;

    if (_from == address(this)) {
      IERC20(_assetContract).safeTransfer(_to, _amount);
    } else {
      IERC20(_assetContract).safeTransferFrom(_from, _to, _amount);
    }

    setTransactedEventHash(_eventHash, true);
  }

  function bulkTransfer(
    address[] calldata _assetContracts,
    address[] calldata _froms,
    address[] calldata _tos,
    uint256[] calldata _amounts,
    bytes32[] calldata _eventHashes
  ) external onlyRole(OPERATOR_ROLE) {
    require(
      _amounts.length == _assetContracts.length &&
        _amounts.length == _froms.length &&
        _amounts.length == _tos.length &&
        _amounts.length == _eventHashes.length,
      "invalid length"
    );
    for (uint256 i = 0; i < _amounts.length; i++) {
      (bool success, bytes memory data) = address(this).delegatecall(
        abi.encodeWithSignature("transfer(address,address,address,uint256,bytes32)",
        _assetContracts[i], _froms[i], _tos[i], _amounts[i], _eventHashes[i])
      );
      emit TransferEvent(_assetContracts[i], _froms[i], _tos[i], _amounts[i], _eventHashes[i], data, success);
    }
  }

  //override
  function isTransactedEventHash(
    bytes32 _eventHash
  ) public view override(IERC20Gateway, TransactedEventHash) returns (bool) {
    return super.isTransactedEventHash(_eventHash);
  }

  function setTransactedEventHash(
    bytes32 _eventHash,
    bool _desired
  )
    public
    override(IERC20Gateway, TransactedEventHash)
    onlyRole(OPERATOR_ROLE)
  {
    super.setTransactedEventHash(_eventHash, _desired);
  }
}
