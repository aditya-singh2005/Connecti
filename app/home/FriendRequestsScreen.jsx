import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    Alert,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { useFriendships } from "../../hooks/useFriendships";

export default function FriendRequestsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('received'); // 'received' or 'sent'

  const {
    pendingRequests,
    sentRequests,
    acceptFriendRequest,
    declineInteraction,
    cancelInteraction,
    pendingCount,
    markInboxSeen,
    refreshFriendships,
  } = useFriendships();

  useFocusEffect(
    useCallback(() => {
      markInboxSeen();
      refreshFriendships(false);
    }, [markInboxSeen, refreshFriendships])
  );

  const handleAcceptRequest = async (friendshipId, friendName) => {
    const success = await acceptFriendRequest(friendshipId);
    if (success) {
      Alert.alert("Success", `You are now friends with ${friendName}!`);
    }
  };

  const handleRejectRequest = (friendshipId, friendName) => {
    Alert.alert(
      "Reject Request",
      `Reject friend request from ${friendName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: () => declineInteraction(friendshipId)
        }
      ]
    );
  };

  const handleCancelRequest = (friendshipId, friendName) => {
    Alert.alert(
      "Cancel Request",
      `Cancel friend request to ${friendName}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Cancel Request",
          style: "destructive",
          onPress: () => cancelInteraction(friendshipId)
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inbox</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Modern Tabs */}
      <View style={styles.tabsWrapper}>
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'received' && styles.activeTab]}
            onPress={() => setActiveTab('received')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'received' && styles.activeTabText]}>
              Received
            </Text>
            {pendingCount > 0 ? (
              <View style={[styles.tabBadge, activeTab === 'received' && styles.activeTabBadge]}>
                <Text style={[styles.tabBadgeText, activeTab === 'received' && styles.activeTabBadgeText]}>
                  {pendingCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'sent' && styles.activeTab]}
            onPress={() => setActiveTab('sent')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'sent' && styles.activeTabText]}>
              Sent
            </Text>
            {sentRequests.length > 0 ? (
              <View style={[styles.tabBadge, activeTab === 'sent' && styles.activeTabBadge]}>
                <Text style={[styles.tabBadgeText, activeTab === 'sent' && styles.activeTabBadgeText]}>
                  {sentRequests.length}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'received' ? (
          pendingRequests.length > 0 ? (
            <View style={styles.listContainer}>
              {pendingRequests.map(request => (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestLeft}>
                    <View style={styles.requestAvatar}>
                      <Text style={styles.requestAvatarText}>
                        {(request.name || request.username || 'C').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.requestInfo}>
                      <Text style={styles.requestName}>{request.name}</Text>
                      <Text style={styles.requestContact}>{request.contact}</Text>
                    </View>
                  </View>

                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      onPress={() => handleRejectRequest(request.id, request.name)}
                      style={styles.iconButtonGhost}
                    >
                      <Ionicons name="close" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleAcceptRequest(request.id, request.name)}
                      style={styles.iconButtonPrimary}
                    >
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="mail-unread" size={32} color="#9CA3AF" />
              </View>
              <Text style={styles.emptyText}>All caught up!</Text>
              <Text style={styles.emptySubtext}>
                You don&apos;t have any pending friend requests right now.
              </Text>
            </View>
          )
        ) : (
          // Sent Requests
          sentRequests.length > 0 ? (
            <View style={styles.listContainer}>
              {sentRequests.map(request => (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestLeft}>
                    <View style={styles.requestAvatar}>
                      <Text style={styles.requestAvatarText}>
                        {(request.name || request.username || 'C').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.requestInfo}>
                      <Text style={styles.requestName}>{request.name}</Text>
                      <Text style={styles.requestContact}>{request.contact}</Text>
                      <View style={styles.pendingStatusRow}>
                        <View style={styles.pendingDot} />
                        <Text style={styles.pendingStatusText}>Awaiting response</Text>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleCancelRequest(request.id, request.name)}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="paper-plane" size={32} color="#9CA3AF" />
              </View>
              <Text style={styles.emptyText}>No sent requests</Text>
              <Text style={styles.emptySubtext}>
                Friend requests you send will appear here until they are accepted.
              </Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  backButton: {
    padding: 4,
    marginLeft: -4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  tabsWrapper: {
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#111827',
  },
  tabBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  activeTabBadge: {
    backgroundColor: '#EEF2FF',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  activeTabBadgeText: {
    color: '#5C7CFA',
  },
  content: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  requestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  requestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  requestAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6B7280',
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  requestContact: {
    fontSize: 13,
    color: '#6B7280',
  },
  pendingStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
    marginLeft: 6,
  },
  pendingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  pendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButtonGhost: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonPrimary: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5C7CFA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#5C7CFA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 16,
  },
  cancelBtnText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 120,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});