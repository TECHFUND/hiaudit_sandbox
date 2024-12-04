// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IERC721Asset {
    function balanceOf(address _owner) external view returns (uint256);

    function ownerOf(uint256 _tokenId) external view returns (address);

    function safeTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        bytes calldata data
    ) external payable;

    function safeTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId
    ) external payable;

    function transferFrom(
        address _from,
        address _to,
        uint256 _tokenId
    ) external payable;

    function approve(address _approved, uint256 _tokenId) external payable;

    function setApprovalForAll(address _operator, bool _approved) external;

    function getApproved(uint256 _tokenId) external view returns (address);

    function isApprovedForAll(address _owner, address _operator)
        external
        view
        returns (bool);

    function exists(uint256 _tokenId) external view returns (bool);

    function mint(address _to, uint256 _tokenId) external;
}

interface IERC721Gateway {
    function isTransactedEventHash(bytes32 _eventHash)
        external
        view
        returns (bool);

    function setTransactedEventHash(bytes32 _eventHash, bool _desired) external;

    function transferFrom(
        address _assetContract,
        address _from,
        address _to,
        uint256 _valueOrTokenId,
        bytes32 _eventHash
    ) external;

    function bulkTransferFrom(
        address[] calldata _assetContracts,
        address[] calldata _froms,
        address[] calldata _tos,
        uint256[] calldata _tokenIds,
        bytes32[] calldata _eventHashes
    ) external;
}
