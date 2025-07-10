// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {CustomizedAccessControl} from "./utils/CustomizedAccessControl.sol";
import {ICardMetadata} from "./interfaces/ICardMetadata.sol";

/**
 * @title CardMetadata
 * @dev A contract to manage the metadata associated with cards, including registration, updates, and retrieval.
 */
contract CardMetadata is CustomizedAccessControl, ICardMetadata {
    /// @dev Mapping from a card ID hash to its associated metadata.
    mapping(bytes32 => string) private metadataMap;

    /**
     * @dev Initializes the contract and sets up roles.
     */
    function initialize() public virtual initializer {
        __CustomizedAccessControl_init();
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Registers metadata for a specific card.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the request.
     * @param cardId The ID of the card to register metadata for.
     * @param metadata The metadata to associate with the card ID.
     */
    function register(
        string calldata requestId,
        string calldata cardId,
        string calldata metadata
    ) public onlyRole(OPERATOR_ROLE) {
        bytes32 cardIdHash = keccak256(bytes(cardId));
        require(
            bytes(metadataMap[cardIdHash]).length == 0,
            "This card's metadata is already registered"
        );
        metadataMap[cardIdHash] = metadata;
        emit CardMetadataRegistered(requestId, cardId);
    }

    /**
     * @notice Registers metadata for multiple cards in a single transaction.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the request.
     * @param cards An array of IdWithMetadata structs containing card IDs and their associated metadata.
     */
    function bulkRegister(
        string calldata requestId,
        IdWithMetadata[] calldata cards
    ) external onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < cards.length; ) {
            register(requestId, cards[i].cardId, cards[i].metadata);
            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Updates the metadata for a specific card.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the request.
     * @param cardId The ID of the card to update metadata for.
     * @param metadata The new metadata to associate with the card ID.
     */
    function update(
        string calldata requestId,
        string calldata cardId,
        string calldata metadata
    ) external onlyRole(OPERATOR_ROLE) {
        bytes32 cardIdHash = keccak256(bytes(cardId));

        require(
            bytes(metadataMap[cardIdHash]).length > 0,
            "Metadata not found"
        );
        metadataMap[cardIdHash] = metadata;
        emit CardMetadataUpdated(requestId, cardId);
    }

    /**
     * @notice Retrieves the metadata associated with a specific card ID.
     * @param cardId The ID of the card to retrieve metadata for.
     * @return The metadata associated with the card ID.
     */
    function getMetadata(
        string calldata cardId
    ) public view returns (string memory) {
        return metadataMap[keccak256(bytes(cardId))];
    }
}
