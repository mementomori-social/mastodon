import { fromJS } from 'immutable';

import type { NotificationGroup } from 'mastodon/models/notification_group';
import type { RootState } from 'mastodon/store';

import { selectUnreadNotificationGroupsCount } from '../notifications';

function group(id: string) {
  return {
    type: 'favourite',
    page_max_id: id,
    page_min_id: id,
  } as unknown as NotificationGroup;
}

function state({
  lastReadId,
  groups = [],
  serverUnreadCount = 0,
  serverUnreadCountReadId = '0',
}: {
  lastReadId: string;
  groups?: NotificationGroup[];
  serverUnreadCount?: number;
  serverUnreadCountReadId?: string;
}) {
  return {
    settings: fromJS({
      notifications: { quickFilter: { show: false, active: 'all' }, shows: {} },
    }),
    notificationGroups: {
      groups,
      pendingGroups: [],
      lastReadId,
      serverUnreadCount,
      serverUnreadCountReadId,
    },
  } as unknown as RootState;
}

describe('selectUnreadNotificationGroupsCount', () => {
  it('counts the unread groups that are loaded', () => {
    expect(
      selectUnreadNotificationGroupsCount(
        state({ lastReadId: '10', groups: [group('12'), group('11')] }),
      ),
    ).toBe(2);
  });

  it('reports the server count when more is unread than is loaded', () => {
    expect(
      selectUnreadNotificationGroupsCount(
        state({
          lastReadId: '10',
          groups: [group('12'), group('11')],
          serverUnreadCount: 55,
          serverUnreadCountReadId: '10',
        }),
      ),
    ).toBe(55);
  });

  it('drops the server count once notifications have been read', () => {
    // Reading moves the marker past the point the count was taken at
    expect(
      selectUnreadNotificationGroupsCount(
        state({
          lastReadId: '12',
          groups: [group('12'), group('11')],
          serverUnreadCount: 55,
          serverUnreadCountReadId: '10',
        }),
      ),
    ).toBe(0);
  });

  it('reports nothing unread after marking everything as read', () => {
    expect(
      selectUnreadNotificationGroupsCount(
        state({
          lastReadId: '99',
          groups: [group('12'), group('11')],
          serverUnreadCount: 55,
          serverUnreadCountReadId: '10',
        }),
      ),
    ).toBe(0);
  });

  it('keeps counting notifications that arrive after the count was taken', () => {
    expect(
      selectUnreadNotificationGroupsCount(
        state({
          lastReadId: '10',
          groups: [group('20'), group('12'), group('11')],
          serverUnreadCount: 2,
          serverUnreadCountReadId: '10',
        }),
      ),
    ).toBe(3);
  });
});
