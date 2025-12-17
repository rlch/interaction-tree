import 'interaction_node.dart';

/// Represents the difference between two tree states.
class TreeDiff {
  const TreeDiff({
    this.removed = const [],
    this.added = const [],
    this.modified = const [],
  });

  static const empty = TreeDiff();

  /// IDs of nodes that were removed.
  final List<String> removed;

  /// Full node data for nodes that were added.
  final List<Map<String, Object?>> added;

  /// IDs of nodes that were modified (state/metadata changed).
  final List<String> modified;

  bool get isEmpty => removed.isEmpty && added.isEmpty && modified.isEmpty;
  bool get isNotEmpty => !isEmpty;

  Map<String, Object?> toJson({
    bool includeModifiedState = false,
    Map<String, Object?> Function(String id)? stateProvider,
  }) =>
      {
        if (removed.isNotEmpty) 'removed': removed,
        if (added.isNotEmpty) 'added': added,
        if (modified.isNotEmpty)
          'modified': includeModifiedState && stateProvider != null
              ? modified
                  .map((id) => {
                        'id': id,
                        'state': stateProvider(id),
                      })
                  .toList()
              : modified,
      };
}

/// Computes the difference between two tree snapshots.
class TreeDiffer {
  const TreeDiffer._();

  /// Compute the diff between a previous tree snapshot and the current tree.
  ///
  /// [previous] - snapshot of node IDs and their state hashes from before the action
  /// [current] - the current tree nodes
  static TreeDiff diff(TreeSnapshot previous, List<InteractionNode> current) {
    final currentSnapshot = TreeSnapshot.fromNodes(current);

    final removed = <String>[];
    final added = <Map<String, Object?>>[];
    final modified = <String>[];

    // Find removed nodes (in previous but not in current)
    for (final id in previous.nodeIds) {
      if (!currentSnapshot.nodeIds.contains(id)) {
        removed.add(id);
      }
    }

    // Find added and modified nodes
    for (final node in _flattenNodes(current)) {
      final id = node.id;
      if (id == null) continue;

      if (!previous.nodeIds.contains(id)) {
        // New node
        added.add(node.toJson());
      } else {
        // Existing node - check if modified
        final previousHash = previous.stateHashes[id];
        final currentHash = currentSnapshot.stateHashes[id];
        if (previousHash != currentHash) {
          modified.add(id);
        }
      }
    }

    return TreeDiff(
      removed: removed,
      added: added,
      modified: modified,
    );
  }

  static Iterable<InteractionNode> _flattenNodes(
    List<InteractionNode> nodes,
  ) sync* {
    for (final node in nodes) {
      yield node;
      yield* _flattenNodes(node.children);
    }
  }
}

/// A snapshot of the tree state at a point in time.
///
/// Used to compute diffs between tree states.
class TreeSnapshot {
  const TreeSnapshot({
    required this.nodeIds,
    required this.stateHashes,
  });

  /// Create a snapshot from the current tree.
  factory TreeSnapshot.fromNodes(List<InteractionNode> nodes) {
    final nodeIds = <String>{};
    final stateHashes = <String, int>{};

    for (final node in _flattenNodes(nodes)) {
      final id = node.id;
      if (id != null) {
        nodeIds.add(id);
        stateHashes[id] = _computeStateHash(node);
      }
    }

    return TreeSnapshot(
      nodeIds: nodeIds,
      stateHashes: stateHashes,
    );
  }

  static const empty = TreeSnapshot(nodeIds: {}, stateHashes: {});

  final Set<String> nodeIds;
  final Map<String, int> stateHashes;

  static Iterable<InteractionNode> _flattenNodes(
    List<InteractionNode> nodes,
  ) sync* {
    for (final node in nodes) {
      yield node;
      yield* _flattenNodes(node.children);
    }
  }

  /// Compute a hash representing the node's current state.
  /// Changes to this hash indicate the node was modified.
  static int _computeStateHash(InteractionNode node) {
    // Hash based on properties that indicate modification:
    // - capabilities (could change if widget state changes)
    // - actions list (could change dynamically)
    // - bounds (position/size changed)
    // - description (could be dynamic)

    var hash = 0;
    hash = _combineHash(hash, node.description?.hashCode ?? 0);
    hash = _combineHash(hash, node.capabilities.length);
    hash = _combineHash(hash, node.actions.length);

    if (node.bounds != null) {
      hash = _combineHash(hash, node.bounds!.left.hashCode);
      hash = _combineHash(hash, node.bounds!.top.hashCode);
      hash = _combineHash(hash, node.bounds!.width.hashCode);
      hash = _combineHash(hash, node.bounds!.height.hashCode);
    }

    return hash;
  }

  static int _combineHash(int hash, int value) {
    return 0x1fffffff & (hash + value);
  }
}
