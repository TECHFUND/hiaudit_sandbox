// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC721EnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import {ERC721BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import {ERC721PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721PausableUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {CustomizedAccessControl} from "./utils/CustomizedAccessControl.sol";
import {IERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ICard} from "./interfaces/ICard.sol";
import {ICardMetadata} from "./interfaces/ICardMetadata.sol";

/**
 * @title Card
 * @dev A contract representing a card with ERC721 functionalities including enumeration, burning, and pausing.
 */
contract Card is
    ERC721EnumerableUpgradeable,
    ERC721BurnableUpgradeable,
    ERC721PausableUpgradeable,
    CustomizedAccessControl,
    ICard
{
    /// @dev Metadata contract for the cards.
    ICardMetadata private cardMetadata;

    /// @dev Mapping from token ID to card ID.
    mapping(uint256 => string) public cardIds;

    /**
     * @dev Initializes the contract with the specified metadata contract address.
     * @param _cardMetadata Address of the metadata contract.
     */
    function initialize(address _cardMetadata) public virtual initializer {
        __ERC721_init("Card", "CRD");
        __ERC721Enumerable_init();
        __ERC721Burnable_init();
        __ERC721Pausable_init();
        __CustomizedAccessControl_init();
        setMetadataContract(_cardMetadata);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Sets the address of the metadata contract.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _cardMetadata The address of the new metadata contract.
     */
    function setMetadataContract(
        address _cardMetadata
    ) public onlyRole(OPERATOR_ROLE) {
        cardMetadata = ICardMetadata(_cardMetadata);
        emit MetadataContractChanged(_cardMetadata);
    }

    /**
     * @notice Mints a new token.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param to The address to receive the minted token.
     * @param tokenId The ID of the token to mint.
     * @param cardId The ID of the card associated with the token.
     */
    function mint(
        address to,
        uint256 tokenId,
        string calldata cardId
    ) public onlyRole(OPERATOR_ROLE) {
        string memory metadata = cardMetadata.getMetadata(cardId);
        require(bytes(metadata).length > 0, "Invalid cardId");
        _mint(to, tokenId);
        cardIds[tokenId] = cardId;
    }

    /**
     * @notice Mints multiple tokens in a single transaction.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param to The address to receive the minted tokens.
     * @param cards An array of token IDs and associated card IDs to mint.
     */
    function bulkMint(
        address to,
        TokenIdWithCardId[] calldata cards
    ) public onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < cards.length; ) {
            mint(to, cards[i].cardTokenId, cards[i].cardId);
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
    )
        public
        override(ERC721BurnableUpgradeable, ICard)
        onlyRole(OPERATOR_ROLE)
    {
        _burn(tokenId);
    }

    /**
     * @dev Internal function to burn a token.
     * @param tokenId The ID of the token to burn.
     */
    function _burn(
        uint256 tokenId
    ) internal virtual override(ERC721Upgradeable) {
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
            CustomizedAccessControl
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Returns the metadata URI for a given token ID.
     * @param tokenId The token ID to retrieve the metadata for.
     * @return The metadata URI as a string.
     */
    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721Upgradeable) returns (string memory) {
        return cardMetadata.getMetadata(cardIds[tokenId]);
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
    ) public virtual override(IERC721Upgradeable, ERC721Upgradeable, ICard) {
        super.transferFrom(from, to, tokenId);
    }

    function ownerOf(
        uint256 tokenId
    )
        public
        view
        override(ERC721Upgradeable, IERC721Upgradeable, ICard)
        returns (address)
    {
        return ERC721Upgradeable.ownerOf(tokenId);
    }
}
