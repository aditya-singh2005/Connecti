import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import { DebugService } from '../services/DebugService';

export const DebugLogger = ({ screenName, maxLogs = 100, initiallyExpanded = false }) => {
    const [logs, setLogs] = useState([]);
    const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
    const [appState, setAppState] = useState(AppState.currentState);
    const flatListRef = useRef(null);
    const subscriptionRef = useRef(null);

    useEffect(() => {
        // Subscribe to logs for this screen
        subscriptionRef.current = DebugService.subscribe(screenName, (newLog) => {
            setLogs((prevLogs) => {
                const updated = [...prevLogs, newLog];
                return updated.slice(-maxLogs); // Keep only last maxLogs entries
            });
        });

        // Get initial logs
        setLogs(DebugService.getLogs(screenName).slice(-maxLogs));

        // Monitor app state changes
        const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
            const timestamp = new Date().toLocaleTimeString();
            DebugService.log(screenName, 'APP_STATE', `App state changed: ${appState} → ${nextAppState}`, {
                from: appState,
                to: nextAppState,
                timestamp
            });
            setAppState(nextAppState);
        });

        // Log component mount
        DebugService.log(screenName, 'LIFECYCLE', `${screenName} mounted`, { timestamp: new Date().toLocaleTimeString() });

        return () => {
            // Log component unmount
            DebugService.log(screenName, 'LIFECYCLE', `${screenName} unmounted`, { timestamp: new Date().toLocaleTimeString() });

            if (subscriptionRef.current) {
                subscriptionRef.current();
            }
            appStateSubscription.remove();
        };
    }, [screenName, maxLogs]);

    const clearLogs = () => {
        DebugService.clearLogs(screenName);
        setLogs([]);
    };

    const getLogColor = (level) => {
        switch (level) {
            case 'ERROR': return '#ff4444';
            case 'WARN': return '#ffaa00';
            case 'SUCCESS': return '#00cc66';
            case 'GEOFENCE': return '#9c27b0';
            case 'NOTIFICATION': return '#2196f3';
            case 'BACKGROUND': return '#ff6f00';
            case 'BLE': return '#00bcd4';
            case 'WAVE': return '#e91e63';
            case 'APP_STATE': return '#673ab7';
            default: return '#888';
        }
    };

    const getAppStateColor = () => {
        switch (appState) {
            case 'active': return '#00cc66';
            case 'background': return '#ffaa00';
            case 'inactive': return '#ff4444';
            default: return '#888';
        }
    };

    const renderLogItem = ({ item, index }) => (
        <View style={styles.logEntry}>
            <View style={styles.logHeader}>
                <Text style={[styles.logLevel, { color: getLogColor(item.level) }]}>
                    [{item.level}]
                </Text>
                <Text style={styles.logTime}>{item.timestamp}</Text>
            </View>
            <Text style={styles.logMessage}>{item.message}</Text>
            {item.data && (
                <Text style={styles.logData}>
                    {typeof item.data === 'string' ? item.data : JSON.stringify(item.data, null, 2)}
                </Text>
            )}
        </View>
    );

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[styles.header, { backgroundColor: isExpanded ? '#1a1a1a' : '#2a2a2a' }]}
                onPress={() => setIsExpanded(!isExpanded)}
            >
                <View style={styles.headerLeft}>
                    <Text style={styles.headerTitle}>🐛 {screenName} Debug</Text>
                    <View style={[styles.appStateBadge, { backgroundColor: getAppStateColor() }]}>
                        <Text style={styles.appStateText}>{appState.toUpperCase()}</Text>
                    </View>
                </View>
                <View style={styles.headerRight}>
                    <Text style={styles.logCount}>{logs.length} logs</Text>
                    <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
                </View>
            </TouchableOpacity>

            {isExpanded && (
                <View style={styles.logContainer}>
                    <View style={styles.toolbar}>
                        <TouchableOpacity style={styles.clearButton} onPress={clearLogs}>
                            <Text style={styles.clearButtonText}>Clear Logs</Text>
                        </TouchableOpacity>
                        <Text style={styles.toolbarInfo}>Max: {maxLogs} logs</Text>
                    </View>

                    <FlatList
                        ref={flatListRef}
                        data={logs}
                        renderItem={renderLogItem}
                        keyExtractor={(item, index) => index.toString()}
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1a1a1a',
        borderRadius: 8,
        marginHorizontal: 10,
        marginVertical: 5,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#333',
        marginBottom: 20, // Add some bottom margin
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    appStateBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    appStateText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    logCount: {
        color: '#888',
        fontSize: 12,
    },
    expandIcon: {
        color: '#fff',
        fontSize: 12,
    },
    logContainer: {
        backgroundColor: '#0a0a0a',
        height: 400, // Fixed height for the container
    },
    toolbar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 8,
        backgroundColor: '#1a1a1a',
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    clearButton: {
        backgroundColor: '#ff4444',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
    },
    clearButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    toolbarInfo: {
        color: '#888',
        fontSize: 11,
    },
    list: {
        flex: 1, // Take up remaining space
    },
    listContent: {
        padding: 8,
        paddingBottom: 20,
    },
    emptyText: {
        color: '#666',
        textAlign: 'center',
        padding: 20,
        fontStyle: 'italic',
    },
    logEntry: {
        backgroundColor: '#1a1a1a',
        padding: 8,
        marginBottom: 6,
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: '#444',
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    logLevel: {
        fontSize: 11,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    logTime: {
        fontSize: 10,
        color: '#666',
        fontFamily: 'monospace',
    },
    logMessage: {
        color: '#fff',
        fontSize: 12,
        marginBottom: 4,
    },
    logData: {
        color: '#aaa',
        fontSize: 10,
        fontFamily: 'monospace',
        backgroundColor: '#0a0a0a',
        padding: 6,
        borderRadius: 3,
        marginTop: 4,
    },
});
