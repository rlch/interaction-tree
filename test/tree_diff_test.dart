import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  group('TreeDiff', () {
    test('empty diff', () {
      const diff = TreeDiff.empty;

      expect(diff.isEmpty, isTrue);
      expect(diff.isNotEmpty, isFalse);
      expect(diff.removed, isEmpty);
      expect(diff.added, isEmpty);
      expect(diff.modified, isEmpty);
    });

    test('detects removed nodes', () {
      const diff = TreeDiff(removed: ['node1', 'node2']);

      expect(diff.isEmpty, isFalse);
      expect(diff.removed, ['node1', 'node2']);
    });

    test('detects added nodes', () {
      final diff = TreeDiff(added: [
        {'id': 'new_node', 'description': 'A new node'},
      ]);

      expect(diff.isEmpty, isFalse);
      expect(diff.added.length, 1);
      expect(diff.added[0]['id'], 'new_node');
    });

    test('detects modified nodes', () {
      const diff = TreeDiff(modified: ['node1']);

      expect(diff.isEmpty, isFalse);
      expect(diff.modified, ['node1']);
    });

    test('toJson produces correct output', () {
      final diff = TreeDiff(
        removed: ['old_node'],
        added: [
          {'id': 'new_node'}
        ],
        modified: ['changed_node'],
      );

      final json = diff.toJson();

      expect(json['removed'], ['old_node']);
      expect(json['added'], [
        {'id': 'new_node'}
      ]);
      expect(json['modified'], ['changed_node']);
    });

    test('toJson excludes empty lists', () {
      const diff = TreeDiff(removed: ['node']);
      final json = diff.toJson();

      expect(json.containsKey('removed'), isTrue);
      expect(json.containsKey('added'), isFalse);
      expect(json.containsKey('modified'), isFalse);
    });

    test('toJson includes modified state when requested', () {
      const diff = TreeDiff(modified: ['node1', 'node2']);

      final json = diff.toJson(
        includeModifiedState: true,
        stateProvider: (id) => {'text': 'Value for $id'},
      );

      final modified = json['modified'] as List;
      expect(modified, isA<List>());
      expect(modified[0]['id'], 'node1');
      expect(modified[0]['state']['text'], 'Value for node1');
    });
  });

  group('TreeSnapshot', () {
    test('creates empty snapshot', () {
      const snapshot = TreeSnapshot.empty;

      expect(snapshot.nodeIds, isEmpty);
      expect(snapshot.stateHashes, isEmpty);
    });

    test('creates snapshot from nodes', () {
      final nodes = [
        InteractionNode(id: 'node1', description: 'Node 1'),
        InteractionNode(id: 'node2', description: 'Node 2'),
      ];

      final snapshot = TreeSnapshot.fromNodes(nodes);

      expect(snapshot.nodeIds, containsAll(['node1', 'node2']));
      expect(snapshot.stateHashes.keys, containsAll(['node1', 'node2']));
    });

    test('includes nested children in snapshot', () {
      final nodes = [
        InteractionNode(
          id: 'parent',
          children: [
            InteractionNode(id: 'child1'),
            InteractionNode(id: 'child2'),
          ],
        ),
      ];

      final snapshot = TreeSnapshot.fromNodes(nodes);

      expect(snapshot.nodeIds, containsAll(['parent', 'child1', 'child2']));
    });

    test('excludes context nodes (no id) from snapshot', () {
      final nodes = [
        InteractionNode(
          description: 'Context only',
          children: [
            InteractionNode(id: 'child'),
          ],
        ),
      ];

      final snapshot = TreeSnapshot.fromNodes(nodes);

      expect(snapshot.nodeIds, contains('child'));
      expect(snapshot.nodeIds.length, 1);
    });
  });

  group('TreeDiffer', () {
    test('detects no changes when trees are identical', () {
      final nodes = [
        InteractionNode(id: 'node1', description: 'Node 1'),
      ];

      final before = TreeSnapshot.fromNodes(nodes);
      final diff = TreeDiffer.diff(before, nodes);

      expect(diff.isEmpty, isTrue);
    });

    test('detects removed nodes', () {
      final before = TreeSnapshot.fromNodes([
        InteractionNode(id: 'node1'),
        InteractionNode(id: 'node2'),
      ]);

      final current = [
        InteractionNode(id: 'node1'),
      ];

      final diff = TreeDiffer.diff(before, current);

      expect(diff.removed, contains('node2'));
      expect(diff.added, isEmpty);
    });

    test('detects added nodes', () {
      final before = TreeSnapshot.fromNodes([
        InteractionNode(id: 'node1'),
      ]);

      final current = [
        InteractionNode(id: 'node1'),
        InteractionNode(id: 'node2', description: 'New node'),
      ];

      final diff = TreeDiffer.diff(before, current);

      expect(diff.removed, isEmpty);
      expect(diff.added.length, 1);
      expect(diff.added[0]['id'], 'node2');
    });

    test('detects modified nodes', () {
      final nodesBefore = [
        InteractionNode(id: 'node1', description: 'Before'),
      ];

      final nodesAfter = [
        InteractionNode(id: 'node1', description: 'After'),
      ];

      final before = TreeSnapshot.fromNodes(nodesBefore);
      final diff = TreeDiffer.diff(before, nodesAfter);

      expect(diff.modified, contains('node1'));
    });

    test('handles complex tree changes', () {
      final before = TreeSnapshot.fromNodes([
        InteractionNode(
          id: 'parent',
          children: [
            InteractionNode(id: 'child1'),
            InteractionNode(id: 'child2'),
          ],
        ),
      ]);

      final current = [
        InteractionNode(
          id: 'parent',
          children: [
            InteractionNode(id: 'child1'),
            InteractionNode(id: 'child3', description: 'New child'),
          ],
        ),
      ];

      final diff = TreeDiffer.diff(before, current);

      expect(diff.removed, contains('child2'));
      expect(diff.added.any((n) => n['id'] == 'child3'), isTrue);
    });
  });
}
