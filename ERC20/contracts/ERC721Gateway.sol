// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "./interface/IERC721Gateway.sol";
import "./utils/TransactedEventHash.sol";

contract ERC721Gateway is
    ERC721Holder,
    IERC721Gateway,
    TransactedEventHash
{
    event TransferEvent(address assetContract, address from, address to, uint256 tokenId, bytes32 eventHash, bytes data, bool success);

    function transferFrom(
        address _assetContract,
        address _from,
        address _to,
        uint256 _tokenId,
        bytes32 _eventHash
    ) public override onlyRole(OPERATOR_ROLE) {
        if (isTransactedEventHash(_eventHash)) return;

        IERC721Asset assetContract = IERC721Asset(_assetContract);

        try assetContract.exists(_tokenId) returns (bool isExist) {
            if (isExist) {
                assetContract.safeTransferFrom(_from, _to, _tokenId);
            } else {
                assetContract.mint(_to, _tokenId);
            }
            // if assetContract doesn't have "exists" function
        } catch (bytes memory) {
            try assetContract.ownerOf(_tokenId) {
                assetContract.safeTransferFrom(_from, _to, _tokenId);
                // catch ownerOf error
            } catch Error(string memory) {
                assetContract.mint(_to, _tokenId);
            }
        }

        setTransactedEventHash(_eventHash, true);
    }

    function bulkTransferFrom(
        address[] calldata _assetContracts,
        address[] calldata _froms,
        address[] calldata _tos,
        uint256[] calldata _tokenIds,
        bytes32[] calldata _eventHashes
    ) external override onlyRole(OPERATOR_ROLE) {
        require(
            _tokenIds.length == _assetContracts.length &&
            _tokenIds.length == _froms.length &&
            _tokenIds.length == _tos.length &&
            _tokenIds.length == _eventHashes.length,
            "invalid length"
        );
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            (bool success, bytes memory data) = address(this).delegatecall(
                abi.encodeWithSignature("transferFrom(address,address,address,uint256,bytes32)",
                _assetContracts[i], _froms[i], _tos[i], _tokenIds[i], _eventHashes[i])
            );
            emit TransferEvent(_assetContracts[i], _froms[i], _tos[i], _tokenIds[i], _eventHashes[i], data, success);
        }
    }

    //override
    function isTransactedEventHash(bytes32 _eventHash)
        public
        view
        override(IERC721Gateway, TransactedEventHash)
        returns (bool)
    {
        return super.isTransactedEventHash(_eventHash);
    }

    function setTransactedEventHash(bytes32 _eventHash, bool _desired)
        public
        override(IERC721Gateway, TransactedEventHash)
        onlyRole(OPERATOR_ROLE)
    {
        super.setTransactedEventHash(_eventHash, _desired);
    }
}
