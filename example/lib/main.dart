import 'package:flutter/material.dart';
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  InteractionService.register();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Interaction Tree Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _counter = 0;
  final List<String> _items = [];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: const Text('Interaction Tree Demo'),
        actions: [
          IconButton(
            key: const InteractionKey('settings-btn', description: 'Open settings'),
            icon: const Icon(Icons.settings),
            onPressed: () => _openSettingsModal(context),
          ),
        ],
      ),
      body: ListView(
        key: const InteractionKey('main-list', description: 'Main scrollable list'),
        padding: const EdgeInsets.all(16),
        children: [
          // Counter card - wrapped in InteractionContext for hierarchy
          InteractionContext(
            description: 'Counter section for incrementing/decrementing a value',
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text(
                      'Counter: $_counter',
                      key: const InteractionKey('counter-display', description: 'Current counter value'),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        FilledButton.icon(
                          key: const InteractionKey('decrement-btn', description: 'Decrease counter'),
                          onPressed: () => setState(() => _counter--),
                          icon: const Icon(Icons.remove),
                          label: const Text('Decrease'),
                        ),
                        const SizedBox(width: 16),
                        FilledButton.icon(
                          key: const InteractionKey('increment-btn', description: 'Increase counter'),
                          onPressed: () => setState(() => _counter++),
                          icon: const Icon(Icons.add),
                          label: const Text('Increase'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 16),

          // Navigation buttons - wrapped in InteractionContext
          InteractionContext(
            description: 'Navigation section with buttons to open pages and modals',
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Navigation', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 12),
                    FilledButton(
                      key: const InteractionKey('nav-detail-btn', description: 'Navigate to detail page'),
                      onPressed: () => _navigateToDetail(context),
                      child: const Text('Go to Detail Page'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      key: const InteractionKey('open-modal-btn', description: 'Open bottom sheet modal'),
                      onPressed: () => _openBottomSheet(context),
                      child: const Text('Open Bottom Sheet'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      key: const InteractionKey('open-dialog-btn', description: 'Open alert dialog'),
                      onPressed: () => _openDialog(context),
                      child: const Text('Open Dialog'),
                    ),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 16),

          // Dynamic list - wrapped in InteractionContext
          InteractionContext(
            description: 'Dynamic item list that can be modified',
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Text('Items (${_items.length})', style: Theme.of(context).textTheme.titleMedium),
                        const Spacer(),
                        IconButton(
                          key: const InteractionKey('add-item-btn', description: 'Add new item to list'),
                          icon: const Icon(Icons.add_circle),
                          onPressed: () => setState(() => _items.add('Item ${_items.length + 1}')),
                        ),
                        IconButton(
                          key: const InteractionKey('clear-items-btn', description: 'Clear all items'),
                          icon: const Icon(Icons.delete_sweep),
                          onPressed: _items.isEmpty ? null : () => setState(() => _items.clear()),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (_items.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('No items yet. Tap + to add some!', textAlign: TextAlign.center),
                      )
                    else
                      ...List.generate(_items.length, (index) {
                        return ListTile(
                          key: InteractionKey('item-$index', description: _items[index]),
                          title: Text(_items[index]),
                          trailing: IconButton(
                            key: InteractionKey('delete-item-$index', description: 'Delete ${_items[index]}'),
                            icon: const Icon(Icons.close),
                            onPressed: () => setState(() => _items.removeAt(index)),
                          ),
                        );
                      }),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 16),

          // Expandable section
          const _ExpandableCard(),

          const SizedBox(height: 32),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const InteractionKey('fab', description: 'Add item FAB'),
        onPressed: () => _showAddItemDialog(context),
        icon: const Icon(Icons.add),
        label: const Text('Add'),
      ),
    );
  }

  void _navigateToDetail(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const DetailPage()),
    );
  }

  void _openBottomSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Bottom Sheet', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            const Text('This is a modal bottom sheet. The widget tree now includes these new elements.'),
            const SizedBox(height: 24),
            FilledButton(
              key: const InteractionKey('sheet-close-btn', description: 'Close bottom sheet'),
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  void _openDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Alert Dialog'),
        content: const Text('This dialog adds new widgets to the tree. When dismissed, they are removed.'),
        actions: [
          TextButton(
            key: const InteractionKey('dialog-cancel-btn', description: 'Cancel dialog'),
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const InteractionKey('dialog-confirm-btn', description: 'Confirm dialog'),
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Confirmed!')),
              );
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }

  void _openSettingsModal(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const _SettingsDialog(),
    );
  }

  void _showAddItemDialog(BuildContext context) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Item'),
        content: TextField(
          key: const InteractionKey('new-item-input', description: 'New item name input'),
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Item name',
            border: OutlineInputBorder(),
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            key: const InteractionKey('add-dialog-cancel-btn', description: 'Cancel adding item'),
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const InteractionKey('add-dialog-add-btn', description: 'Confirm add item'),
            onPressed: () {
              final name = controller.text.trim();
              if (name.isNotEmpty) {
                setState(() => _items.add(name));
              }
              Navigator.pop(context);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }
}

class _ExpandableCard extends StatefulWidget {
  const _ExpandableCard();

  @override
  State<_ExpandableCard> createState() => _ExpandableCardState();
}

class _ExpandableCardState extends State<_ExpandableCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: [
          ListTile(
            key: const InteractionKey('expandable-header', description: 'Toggle expandable section'),
            title: const Text('Expandable Section'),
            subtitle: Text(_expanded ? 'Tap to collapse' : 'Tap to expand'),
            trailing: Icon(_expanded ? Icons.expand_less : Icons.expand_more),
            onTap: () => setState(() => _expanded = !_expanded),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox.shrink(),
            secondChild: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('This content appears when expanded. These widgets are added to the tree.'),
                  const SizedBox(height: 12),
                  FilledButton.tonal(
                    key: const InteractionKey('expanded-action-btn', description: 'Action inside expanded section'),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Action from expanded section!')),
                      );
                    },
                    child: const Text('Expanded Action'),
                  ),
                ],
              ),
            ),
            crossFadeState: _expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 200),
          ),
        ],
      ),
    );
  }
}

class _SettingsDialog extends StatefulWidget {
  const _SettingsDialog();

  @override
  State<_SettingsDialog> createState() => _SettingsDialogState();
}

class _SettingsDialogState extends State<_SettingsDialog> {
  bool _darkMode = false;
  bool _notifications = true;
  double _fontSize = 1.0;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Settings'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SwitchListTile(
            key: const InteractionKey('dark-mode-switch', description: 'Toggle dark mode'),
            title: const Text('Dark Mode'),
            value: _darkMode,
            onChanged: (v) => setState(() => _darkMode = v),
          ),
          SwitchListTile(
            key: const InteractionKey('notifications-switch', description: 'Toggle notifications'),
            title: const Text('Notifications'),
            value: _notifications,
            onChanged: (v) => setState(() => _notifications = v),
          ),
          const SizedBox(height: 8),
          Text('Font Size: ${(_fontSize * 100).toInt()}%'),
          Slider(
            key: const InteractionKey('font-size-slider', description: 'Adjust font size'),
            value: _fontSize,
            min: 0.5,
            max: 2.0,
            divisions: 6,
            onChanged: (v) => setState(() => _fontSize = v),
          ),
        ],
      ),
      actions: [
        FilledButton(
          key: const InteractionKey('settings-save-btn', description: 'Save settings'),
          onPressed: () => Navigator.pop(context),
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class DetailPage extends StatelessWidget {
  const DetailPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Page'),
        leading: IconButton(
          key: const InteractionKey('back-btn', description: 'Go back to home'),
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle, size: 64, color: Colors.green),
            const SizedBox(height: 16),
            Text(
              'Detail Page',
              key: const InteractionKey('detail-title', description: 'Detail page title'),
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 8),
            const Text('This is a new page with a completely different widget tree.'),
            const SizedBox(height: 32),
            FilledButton.icon(
              key: const InteractionKey('detail-action-btn', description: 'Perform detail action'),
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Detail Action'),
                    content: const Text('You triggered an action from the detail page!'),
                    actions: [
                      FilledButton(
                        key: const InteractionKey('detail-dialog-ok-btn', description: 'OK button'),
                        onPressed: () => Navigator.pop(context),
                        child: const Text('OK'),
                      ),
                    ],
                  ),
                );
              },
              icon: const Icon(Icons.star),
              label: const Text('Do Something'),
            ),
          ],
        ),
      ),
    );
  }
}