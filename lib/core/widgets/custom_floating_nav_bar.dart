import 'dart:ui';
import 'package:flutter/material.dart';
import 'nav_bar_icon_widget.dart';

class CustomFloatingNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<NavBarItem> items;

  const CustomFloatingNavBar({super.key, required this.currentIndex, required this.onTap, required this.items});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    return ClipRRect(
      borderRadius: BorderRadius.circular(25),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          height: 72,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface.withValues(alpha: .88),
            borderRadius: BorderRadius.circular(25),
            border: Border.all(color: accent.withValues(alpha: .20)),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .24), blurRadius: 24, offset: const Offset(0, 8))],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(items.length, (i) {
              final item = items[i];
              final active = i == currentIndex;
              return Expanded(
                child: Semantics(
                  button: true,
                  selected: active,
                  child: GestureDetector(
                    onTap: () => onTap(i),
                    behavior: HitTestBehavior.opaque,
                    child: Center(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 240),
                        curve: Curves.easeOutCubic,
                        padding: EdgeInsets.symmetric(horizontal: active ? 15 : 10, vertical: 10),
                        decoration: BoxDecoration(
                          gradient: active ? LinearGradient(colors: [accent, Color.lerp(accent, const Color(0xFFB14DFF), .55)!]) : null,
                          color: active ? null : Colors.transparent,
                          borderRadius: BorderRadius.circular(18),
                          boxShadow: active ? [BoxShadow(color: accent.withValues(alpha: .28), blurRadius: 13, offset: const Offset(0, 4))] : null,
                        ),
                        child: item.child != null
                            ? SizedBox(width: 28, height: 28, child: item.child)
                            : Stack(clipBehavior: Clip.none, children: [
                                Icon(item.icon, size: active ? 25 : 24, color: active ? Colors.white : theme.colorScheme.onSurfaceVariant),
                                if ((item.badgeCount ?? 0) > 0)
                                  Positioned(right: -9, top: -8, child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                    decoration: BoxDecoration(color: const Color(0xFFFF4D78), borderRadius: BorderRadius.circular(10), border: Border.all(color: theme.colorScheme.surface, width: 1.5)),
                                    child: Text(item.badgeCount! > 99 ? '99+' : '${item.badgeCount}', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
                                  )),
                              ]),
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class NavBarItem {
  final IconData? icon;
  final Widget? child;
  final int? badgeCount;
  const NavBarItem({this.icon, this.child, this.badgeCount});
}
