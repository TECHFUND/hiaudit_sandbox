// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC721EnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import {ERC721BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {CustomizedAccessControl} from "./utils/CustomizedAccessControl.sol";
import {IERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ERC5192Upgradeable} from "./abstract/ERC5192Upgradeable.sol";
import {IBasicCard} from "./interfaces/IBasicCard.sol";
import {ICardMetadata} from "./interfaces/ICardMetadata.sol";

/**
 * @title BasicCard
 * @dev A contract representing a basic card in a deck, implementing various ERC721 functionalities.
 */
contract BasicCard is
    ERC721EnumerableUpgradeable,
    ERC721BurnableUpgradeable,
    CustomizedAccessControl,
    ERC5192Upgradeable,
    IBasicCard
{
    /// @dev Metadata contract for the cards.
    ICardMetadata private cardMetadata;

    /// @dev Mapping from token ID to card ID.
    mapping(uint256 => string) public cardIds;

    /// @notice The initial number of cards in a deck.
    uint256 internal constant INITIAL_DECK_COUNT = 30;

    /**
     * @dev Initializes the contract with the specified metadata contract address.
     * @param _cardMetadata Address of the metadata contract.
     */
    function initialize(address _cardMetadata) public virtual initializer {
        __ERC721_init("BasicCard", "BCD");
        __ERC5192Upgradeable_init(true);
        __ERC721Enumerable_init();
        __ERC721Burnable_init();
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
     * @notice Mints a new token by request.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the request.
     * @param to The address to receive the minted token.
     * @param tokenId The ID of the token to mint.
     * @param cardId The ID of the card associated with the token.
     */
    function getByTicket(
        string calldata requestId,
        address to,
        uint256 tokenId,
        string calldata cardId
    ) public onlyRole(OPERATOR_ROLE) {
        mint(to, tokenId, cardId);
        emit GetByTicket(requestId, to, tokenId);
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
     * @notice Deals an initial deck of cards.
     * @dev Mints a batch of tokens and assigns them to the specified address.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the request.
     * @param to The address to receive the minted tokens.
     * @param basicCards An array of token IDs and associated card IDs to mint.
     */
    function dealInitialDeck(
        string calldata requestId,
        address to,
        TokenIdWithcardId[] calldata basicCards
    ) public onlyRole(OPERATOR_ROLE) {
        require(
            basicCards.length == INITIAL_DECK_COUNT,
            "Invalid basic card's count"
        );
        _bulkMint(to, basicCards);
        emit InitialDeck(requestId, to, basicCards);
    }

    /**
     * @dev Internal function to mint multiple tokens in a single transaction.
     * @param to The address to receive the minted tokens.
     * @param basicCards An array of token IDs and associated card IDs to mint.
     */
    function _bulkMint(
        address to,
        TokenIdWithcardId[] calldata basicCards
    ) internal {
        for (uint256 i = 0; i < basicCards.length; ) {
            mint(to, basicCards[i].basicCardTokenId, basicCards[i].cardId);
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
        override(ERC721BurnableUpgradeable, IBasicCard)
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
     * @notice Transfers a token from one address to another.
     * @dev Override of the transferFrom function to include the lock check.
     * @param from The address to send the token from.
     * @param to The address to send the token to.
     * @param tokenId The ID of the token to transfer.
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    )
        public
        override(IERC721Upgradeable, ERC721Upgradeable, ERC5192Upgradeable)
        checkLock
    {
        super.transferFrom(from, to, tokenId);
    }

    /**
     * @notice Safely transfers a token from one address to another with additional data.
     * @dev Override of the safeTransferFrom function to include the lock check.
     * @param from The address to send the token from.
     * @param to The address to send the token to.
     * @param tokenId The ID of the token to transfer.
     * @param data Additional data with no specified format.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    )
        public
        virtual
        override(ERC5192Upgradeable, ERC721Upgradeable, IERC721Upgradeable)
        checkLock
    {
        super.safeTransferFrom(from, to, tokenId, data);
    }

    /**
     * @notice Safely transfers a token from one address to another.
     * @dev Override of the safeTransferFrom function to include the lock check.
     * @param from The address to send the token from.
     * @param to The address to send the token to.
     * @param tokenId The ID of the token to transfer.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    )
        public
        virtual
        override(ERC5192Upgradeable, ERC721Upgradeable, IERC721Upgradeable)
        checkLock
    {
        super.safeTransferFrom(from, to, tokenId);
    }

    /**
     * @notice Approves another address to transfer the given token ID.
     * @dev Override of the approve function to include the lock check.
     * @param to The address to be approved for the given token ID.
     * @param tokenId The token ID to approve.
     */
    function approve(
        address to,
        uint256 tokenId
    )
        public
        override(IERC721Upgradeable, ERC721Upgradeable, ERC5192Upgradeable)
        checkLock
    {
        super.approve(to, tokenId);
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
            ERC5192Upgradeable
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
     * @notice Approves or disapproves an operator to manage all of the caller's assets.
     * @param operator The operator to be approved or disapproved.
     * @param approved The approval status (true = approved, false = disapproved).
     */
    function setApprovalForAll(
        address operator,
        bool approved
    )
        public
        override(IERC721Upgradeable, ERC721Upgradeable, ERC5192Upgradeable)
    {
        super.setApprovalForAll(operator, approved);
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
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
    {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    function ownerOf(
        uint256 tokenId
    )
        public
        view
        override(ERC721Upgradeable, IERC721Upgradeable, IBasicCard)
        returns (address)
    {
        return ERC721Upgradeable.ownerOf(tokenId);
    }
}
