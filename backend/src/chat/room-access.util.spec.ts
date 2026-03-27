import {
  SHARE_WITH_JESUS_ROOM_PREFIX,
  userMayAccessRoomByTitle,
} from './room-access.util';

describe('userMayAccessRoomByTitle', () => {
  it('allows both dm participants', () => {
    expect(userMayAccessRoomByTitle('a', 'dm:a:b')).toBe(true);
    expect(userMayAccessRoomByTitle('b', 'dm:a:b')).toBe(true);
  });

  it('denies third party for dm', () => {
    expect(userMayAccessRoomByTitle('c', 'dm:a:b')).toBe(false);
  });

  it('denies malformed dm title', () => {
    expect(userMayAccessRoomByTitle('a', 'dm:a')).toBe(false);
  });

  it('allows only owner for share-with-jesus room', () => {
    expect(
      userMayAccessRoomByTitle('owner', `${SHARE_WITH_JESUS_ROOM_PREFIX}owner`),
    ).toBe(true);
    expect(
      userMayAccessRoomByTitle('other', `${SHARE_WITH_JESUS_ROOM_PREFIX}owner`),
    ).toBe(false);
  });

  it('allows any member check for ordinary titles', () => {
    expect(userMayAccessRoomByTitle('x', 'my-club')).toBe(true);
  });
});
