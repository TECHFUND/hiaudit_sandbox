// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC721EnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import {ERC721BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import {ERC721PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721PausableUpgradeable.sol";
import {ERC721URIStorageUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {CustomizedAccessControl} from "./utils/CustomizedAccessControl.sol";
import {IERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Skin
 * @dev A contract representing a skin NFT with ERC721 functionalities including enumeration, burning, pausing, and URI storage.
 */
contract Skin is
    ERC721EnumerableUpgradeable,
    ERC721BurnableUpgradeable,
    ERC721PausableUpgradeable,
    ERC721URIStorageUpgradeable,
    CustomizedAccessControl
{
    /**
     * @dev Struct to hold token ID and its associated metadata URI.
     */
    struct TokenIdWithMetadata {
        uint256 tokenId;
        string uri;
    }

    /**
     * @dev Initializes the contract and sets up roles.
     */
    function initialize() public virtual initializer {
        __ERC721_init("Skin", "SKN");
        __ERC721Enumerable_init();
        __ERC721Burnable_init();
        __ERC721Pausable_init();
        __CustomizedAccessControl_init();
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Mints a new token with a specific URI.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param to The address to receive the minted token.
     * @param tokenId The ID of the token to mint.
     * @param uri The URI of the token's metadata.
     */
    function mint(
        address to,
        uint256 tokenId,
        string calldata uri
    ) public onlyRole(OPERATOR_ROLE) {
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    /**
     * @notice Mints multiple tokens in a single transaction.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param to The address to receive the minted tokens.
     * @param units An array of TokenIdWithMetadata structs containing the token IDs and URIs to mint.
     */
    function bulkMint(
        address to,
        TokenIdWithMetadata[] calldata units
    ) public onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < units.length; ) {
            mint(to, units[i].tokenId, units[i].uri);
            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Burns a token.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param tokenId The ID of the token to burn.
     */
    function burn(
        uint256 tokenId
    ) public override(ERC721BurnableUpgradeable) onlyRole(OPERATOR_ROLE) {
        _burn(tokenId);
    }

    /**
     * @dev Internal function to burn a token and remove its URI.
     * @param tokenId The ID of the token to burn.
     */
    function _burn(
        uint256 tokenId
    )
        internal
        virtual
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
    {
        super._burn(tokenId);
    }

    /**
     * @notice Pauses all token transfers.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     */
    function pause() public virtual onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses all token transfers.
     * @dev Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     */
    function unpause() public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Transfers a token from one address to another.
     * @dev Override of the transferFrom function.
     * @param from The address to send the token from.
     * @param to The address to send the token to.
     * @param tokenId The ID of the token to transfer.
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override(IERC721Upgradeable, ERC721Upgradeable) {
        super.transferFrom(from, to, tokenId);
    }

    /**
     * @notice Returns the metadata URI for a given token ID.
     * @param tokenId The token ID to retrieve the metadata for.
     * @return The metadata URI as a string.
     */
    function tokenURI(
        uint256 tokenId
    )
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @notice Checks if the contract supports a given interface.
     * @param interfaceId The interface identifier, as specified in ERC-165.
     * @return `true` if the contract supports the requested interface, `false` otherwise.
     */
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(
            ERC721Upgradeable,
            ERC721EnumerableUpgradeable,
            CustomizedAccessControl,
            ERC721URIStorageUpgradeable
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Hook that is called before any token transfer. This includes minting and burning.
     * @param from The address sending the token.
     * @param to The address receiving the token.
     * @param firstTokenId The ID of the first token to be transferred.
     * @param batchSize The number of tokens to be transferred.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    )
        internal
        virtual
        override(
            ERC721Upgradeable,
            ERC721EnumerableUpgradeable,
            ERC721PausableUpgradeable
        )
    {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }
}
