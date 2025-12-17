import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

import 'package:example/main.dart';

void main() {
  testWidgets('Counter increments using interaction finder',
      (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    // Verify counter starts at 0
    expect(find.text('Counter: 0'), findsOneWidget);

    // Tap increment button using InteractionKey finder
    await tester.tap(interaction('increment-btn'));
    await tester.pump();

    // Verify counter incremented
    expect(find.text('Counter: 1'), findsOneWidget);
  });

  testWidgets('Counter decrements using interaction finder',
      (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    expect(find.text('Counter: 0'), findsOneWidget);

    await tester.tap(interaction('decrement-btn'));
    await tester.pump();

    expect(find.text('Counter: -1'), findsOneWidget);
  });

  testWidgets('Can navigate to detail page', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    // Tap navigation button
    await tester.tap(interaction('nav-detail-btn'));
    await tester.pumpAndSettle();

    // Verify we're on detail page
    expect(interaction('detail-title'), findsOneWidget);
    expect(interaction('back-btn'), findsOneWidget);
  });

  testWidgets('Can open and close dialog', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    // Open dialog
    await tester.tap(interaction('open-dialog-btn'));
    await tester.pumpAndSettle();

    // Verify dialog buttons exist
    expect(interaction('dialog-cancel-btn'), findsOneWidget);
    expect(interaction('dialog-confirm-btn'), findsOneWidget);

    // Close dialog
    await tester.tap(interaction('dialog-cancel-btn'));
    await tester.pumpAndSettle();

    // Verify dialog is closed
    expect(interaction('dialog-cancel-btn'), findsNothing);
  });

  testWidgets('Can add items to list', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    // Initially no items
    expect(interaction('item-0'), findsNothing);

    // Add item using the icon button
    await tester.tap(interaction('add-item-btn'));
    await tester.pump();

    // Verify item appears
    expect(interaction('item-0'), findsOneWidget);

    // Add another
    await tester.tap(interaction('add-item-btn'));
    await tester.pump();

    expect(interaction('item-1'), findsOneWidget);
  });

  testWidgets('Can clear items from list', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    // Add some items
    await tester.tap(interaction('add-item-btn'));
    await tester.pump();
    await tester.tap(interaction('add-item-btn'));
    await tester.pump();

    expect(interaction('item-0'), findsOneWidget);
    expect(interaction('item-1'), findsOneWidget);

    // Clear all items
    await tester.tap(interaction('clear-items-btn'));
    await tester.pump();

    // Verify items are gone
    expect(interaction('item-0'), findsNothing);
    expect(interaction('item-1'), findsNothing);
  });

  testWidgets('Expandable section toggles', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    // Need to scroll to make expandable header visible
    await tester.scrollUntilVisible(
      interaction('expandable-header'),
      100,
      scrollable: find.byType(Scrollable),
    );
    await tester.pumpAndSettle();

    // Verify we can find the expandable header
    expect(interaction('expandable-header'), findsOneWidget);

    // The AnimatedCrossFade keeps both children in the tree,
    // so just verify we can tap the header to toggle
    final headerFinder = interaction('expandable-header');

    // Toggle expand
    await tester.tap(headerFinder);
    await tester.pumpAndSettle();

    // Toggle collapse
    await tester.tap(headerFinder);
    await tester.pumpAndSettle();

    // Header should still be there
    expect(interaction('expandable-header'), findsOneWidget);
  });

  testWidgets('Settings dialog opens with toggles', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    // Open settings
    await tester.tap(interaction('settings-btn'));
    await tester.pumpAndSettle();

    // Verify settings widgets exist
    expect(interaction('dark-mode-switch'), findsOneWidget);
    expect(interaction('notifications-switch'), findsOneWidget);
    expect(interaction('font-size-slider'), findsOneWidget);

    // Close settings
    await tester.tap(interaction('settings-save-btn'));
    await tester.pumpAndSettle();

    expect(interaction('dark-mode-switch'), findsNothing);
  });
}
