import {
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Empty,
  Grid,
  Input,
  InputNumber,
  Message,
  Modal,
  Radio,
  Space,
  Switch,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { IconDelete, IconEdit, IconPlus } from '@arco-design/web-react/icon';
import { useMemo, useState } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';
import type {
  BanType,
  Community,
  Server,
  ServerDraft,
  ServerRconVerificationResult,
  ServerSettingsDraft,
} from '../types';
import { banTypeLabelMap, getBanDurationLabel, getBanTypeDescription } from '../utils/ban';
import { getErrorMessage } from '../utils/error';

const { Row, Col } = Grid;

type ServerTarget = {
  communityId: string;
  serverId: string;
};

type PlayerActionType = 'kick' | 'ban';

type PlayerActionTarget = ServerTarget & {
  playerId: string;
  actionType: PlayerActionType;
};

type ServerVerificationState = ServerRconVerificationResult & {
  fingerprint: string;
};

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const createEmptyServerDraft = (): ServerDraft => ({
  name: '',
  ip: '',
  port: 27015,
  rconPassword: '',
  whitelistEnabled: false,
  entryVerificationEnabled: false,
  minEntryRating: 0,
  minSteamLevel: 0,
});

const createEmptyServerSettingsDraft = (): ServerSettingsDraft => ({
  ip: '',
  port: 27015,
  rconPassword: '',
  whitelistEnabled: false,
  entryVerificationEnabled: false,
  minEntryRating: 0,
  minSteamLevel: 0,
});

const createServerSettingsDraft = (server: Server): ServerSettingsDraft => ({
  ip: server.ip,
  port: server.port,
  rconPassword: server.rconPassword,
  whitelistEnabled: server.whitelistEnabled ?? false,
  entryVerificationEnabled: server.entryVerificationEnabled ?? false,
  minEntryRating: server.minEntryRating ?? 0,
  minSteamLevel: server.minSteamLevel ?? 0,
});

const validateServerConnectionDraft = (draft: Pick<ServerDraft, 'ip' | 'port' | 'rconPassword'>) => {
  const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

  if (!ipv4Pattern.test(draft.ip.trim())) {
    return '请输入有效的 IPv4 地址';
  }

  if (!draft.port || draft.port < 1 || draft.port > 65535) {
    return '端口范围需在 1 到 65535 之间';
  }

  if (draft.rconPassword.trim().length < 6) {
    return 'RCON 密码至少需要 6 位';
  }

  return null;
};

const validateEntryVerificationThresholds = (
  draft: Pick<ServerDraft, 'minEntryRating' | 'minSteamLevel'>,
) => {
  if (draft.minEntryRating < 0) {
    return '最小进服 rating 不能小于 0';
  }

  if (draft.minSteamLevel < 0) {
    return '最小 Steam 等级不能小于 0';
  }

  return null;
};

const validateServerDraft = (
  draft: Pick<ServerDraft, 'ip' | 'port' | 'rconPassword' | 'minEntryRating' | 'minSteamLevel'> & Partial<Pick<ServerDraft, 'name'>>,
) => {
  if (typeof draft.name === 'string' && !draft.name.trim()) {
    return '请输入服务器名称';
  }

  return validateServerConnectionDraft(draft) ?? validateEntryVerificationThresholds(draft);
};

const createServerVerificationFingerprint = (draft: Pick<ServerDraft, 'ip' | 'port' | 'rconPassword'>) =>
  `${draft.ip.trim()}|${draft.port}|${draft.rconPassword}`;

const COMMUNITY_SERVER_PREVIEW_COUNT = 3;

const getEntryVerificationThresholdLabel = (server: Pick<Server, 'minEntryRating' | 'minSteamLevel'>) =>
  `最低进服 rating ${server.minEntryRating}，最低 Steam 等级 ${server.minSteamLevel}`;

const getServerAccessSummary = (server: Server) => {
  if (server.whitelistEnabled && server.entryVerificationEnabled) {
    return `当前已同时启用白名单和进服验证，${getEntryVerificationThresholdLabel(server)}。`;
  }

  if (server.whitelistEnabled) {
    return '当前仅开启白名单，适合受控开放服务器。';
  }

  if (server.entryVerificationEnabled) {
    return `当前仅开启进服验证，${getEntryVerificationThresholdLabel(server)}。`;
  }

  return '当前未开启白名单和进服验证。';
};

export const CommunityManagementPage = () => {
  const {
    state,
    addCommunity,
    updateCommunity,
    deleteCommunity,
    verifyServerRcon,
    addServer,
    updateServer,
    deleteServer,
    loadServerPlayers,
    kickServerPlayer,
    banServerPlayer,
    apiMode,
    apiError,
    bootstrapping,
  } = useAppStore();
  const [communityModalVisible, setCommunityModalVisible] = useState(false);
  const [communityEditModalVisible, setCommunityEditModalVisible] = useState(false);
  const [serverDrawerVisible, setServerDrawerVisible] = useState(false);
  const [serverSettingsVisible, setServerSettingsVisible] = useState(false);
  const [playerDrawerVisible, setPlayerDrawerVisible] = useState(false);
  const [communityName, setCommunityName] = useState('');
  const [editingCommunityName, setEditingCommunityName] = useState('');
  const [serverDraft, setServerDraft] = useState<ServerDraft>(createEmptyServerDraft);
  const [serverSettingsDraft, setServerSettingsDraft] = useState<ServerSettingsDraft>(createEmptyServerSettingsDraft);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null);
  const [serverListCommunityId, setServerListCommunityId] = useState<string | null>(null);
  const [serverSettingsTarget, setServerSettingsTarget] = useState<ServerTarget | null>(null);
  const [playerDrawerTarget, setPlayerDrawerTarget] = useState<ServerTarget | null>(null);
  const [playerActionTarget, setPlayerActionTarget] = useState<PlayerActionTarget | null>(null);
  const [playerActionReason, setPlayerActionReason] = useState('');
  const [banType, setBanType] = useState<BanType>('steam_account');
  const [banMode, setBanMode] = useState<'permanent' | 'temporary'>('permanent');
  const [banDurationSeconds, setBanDurationSeconds] = useState<number | undefined>(undefined);
  const [submittingServer, setSubmittingServer] = useState(false);
  const [submittingCommunity, setSubmittingCommunity] = useState(false);
  const [submittingCommunityEdit, setSubmittingCommunityEdit] = useState(false);
  const [submittingServerSettings, setSubmittingServerSettings] = useState(false);
  const [submittingPlayerAction, setSubmittingPlayerAction] = useState(false);
  const [loadingPlayerDrawer, setLoadingPlayerDrawer] = useState(false);
  const [verifyingServer, setVerifyingServer] = useState(false);
  const [serverVerification, setServerVerification] = useState<ServerVerificationState | null>(null);

  const totalServerCount = useMemo(
    () => state.communities.reduce((count, community) => count + community.servers.length, 0),
    [state.communities],
  );

  const totalOnlinePlayerCount = useMemo(
    () =>
      state.communities.reduce(
        (count, community) => count + community.servers.reduce((serverCount, server) => serverCount + server.onlinePlayers.length, 0),
        0,
      ),
    [state.communities],
  );

  const serverSettingsContext = useMemo(() => {
    if (!serverSettingsTarget) {
      return null;
    }

    const community = state.communities.find((item) => item.id === serverSettingsTarget.communityId);
    const server = community?.servers.find((item) => item.id === serverSettingsTarget.serverId);

    return community && server ? { community, server } : null;
  }, [serverSettingsTarget, state.communities]);

  const playerDrawerContext = useMemo(() => {
    if (!playerDrawerTarget) {
      return null;
    }

    const community = state.communities.find((item) => item.id === playerDrawerTarget.communityId);
    const server = community?.servers.find((item) => item.id === playerDrawerTarget.serverId);

    return community && server ? { community, server } : null;
  }, [playerDrawerTarget, state.communities]);

  const playerActionContext = useMemo(() => {
    if (!playerActionTarget) {
      return null;
    }

    const community = state.communities.find((item) => item.id === playerActionTarget.communityId);
    const server = community?.servers.find((item) => item.id === playerActionTarget.serverId);
    const player = server?.onlinePlayers.find((item) => item.id === playerActionTarget.playerId);

    return community && server && player ? { community, server, player } : null;
  }, [playerActionTarget, state.communities]);

  const serverListCommunity = useMemo(() => {
    if (!serverListCommunityId) {
      return null;
    }

    return state.communities.find((item) => item.id === serverListCommunityId) ?? null;
  }, [serverListCommunityId, state.communities]);

  const serverDraftVerificationFingerprint = useMemo(
    () => createServerVerificationFingerprint(serverDraft),
    [serverDraft.ip, serverDraft.port, serverDraft.rconPassword],
  );
  const serverDraftVerified = serverVerification?.fingerprint === serverDraftVerificationFingerprint;
  const serverDraftVerificationStale = Boolean(serverVerification && !serverDraftVerified);

  const openServerDrawer = (community: Community) => {
    setSelectedCommunity(community);
    setServerDraft(createEmptyServerDraft());
    setServerVerification(null);
    setServerDrawerVisible(true);
  };

  const openServerListDrawer = (communityId: string) => {
    setServerListCommunityId(communityId);
  };

  const closeServerListDrawer = () => {
    setServerListCommunityId(null);
  };

  const openServerSettingsDrawer = (communityId: string, server: Server) => {
    setServerSettingsTarget({ communityId, serverId: server.id });
    setServerSettingsDraft(createServerSettingsDraft(server));
    setServerSettingsVisible(true);
  };

  const openPlayerDrawer = async (communityId: string, serverId: string) => {
    setPlayerDrawerTarget({ communityId, serverId });
    setPlayerDrawerVisible(true);
    setLoadingPlayerDrawer(true);

    try {
      await loadServerPlayers(communityId, serverId);
    } catch (error) {
      Message.error(getErrorMessage(error, '在线玩家加载失败'));
    } finally {
      setLoadingPlayerDrawer(false);
    }
  };

  const handleRefreshPlayerDrawer = async () => {
    if (!playerDrawerTarget) {
      return;
    }

    setLoadingPlayerDrawer(true);

    try {
      await loadServerPlayers(playerDrawerTarget.communityId, playerDrawerTarget.serverId);
      Message.success('在线玩家已刷新');
    } catch (error) {
      Message.error(getErrorMessage(error, '在线玩家刷新失败'));
    } finally {
      setLoadingPlayerDrawer(false);
    }
  };

  const openPlayerActionModal = (target: PlayerActionTarget) => {
    setPlayerActionTarget(target);
    setPlayerActionReason('');
    setBanType('steam_account');
    setBanMode('permanent');
    setBanDurationSeconds(undefined);
  };

  const closePlayerActionModal = () => {
    setPlayerActionTarget(null);
    setPlayerActionReason('');
    setBanType('steam_account');
    setBanMode('permanent');
    setBanDurationSeconds(undefined);
  };

  const openCommunityEditModal = (community: Community) => {
    setEditingCommunity(community);
    setEditingCommunityName(community.name);
    setCommunityEditModalVisible(true);
  };

  const closeCommunityEditModal = () => {
    setCommunityEditModalVisible(false);
    setEditingCommunity(null);
    setEditingCommunityName('');
  };

  const handleCreateCommunity = async () => {
    const trimmedName = communityName.trim();

    if (!trimmedName) {
      Message.warning('请输入社区名称');
      return;
    }

    setSubmittingCommunity(true);

    try {
      await addCommunity(trimmedName);
      setCommunityName('');
      setCommunityModalVisible(false);
      Message.success('社区添加成功');
    } catch (error) {
      Message.error(getErrorMessage(error, '社区添加失败'));
    } finally {
      setSubmittingCommunity(false);
    }
  };

  const handleUpdateCommunity = async () => {
    if (!editingCommunity) {
      return;
    }

    const trimmedName = editingCommunityName.trim();

    if (!trimmedName) {
      Message.warning('请输入社区名称');
      return;
    }

    setSubmittingCommunityEdit(true);

    try {
      const updatedCommunity = await updateCommunity(editingCommunity.id, trimmedName);

      if (selectedCommunity?.id === updatedCommunity.id) {
        setSelectedCommunity(updatedCommunity);
      }

      closeCommunityEditModal();
      Message.success('社区名称已更新');
    } catch (error) {
      Message.error(getErrorMessage(error, '社区名称更新失败'));
    } finally {
      setSubmittingCommunityEdit(false);
    }
  };

  const handleVerifyServerDraft = async () => {
    if (!selectedCommunity) {
      return;
    }

    const errorMessage = validateServerConnectionDraft(serverDraft);

    if (errorMessage) {
      Message.warning(errorMessage);
      return;
    }

    setVerifyingServer(true);

    try {
      const result = await verifyServerRcon(selectedCommunity.id, serverDraft);
      setServerVerification({
        ...result,
        fingerprint: createServerVerificationFingerprint(serverDraft),
      });
      Message.success('RCON 校验通过，可以添加服务器');
    } catch (error) {
      Message.error(getErrorMessage(error, 'RCON 校验失败'));
    } finally {
      setVerifyingServer(false);
    }
  };

  const handleDeleteCommunity = (community: Community) => {
    Modal.confirm({
      title: '删除社区',
      content: `确认删除社区“${community.name}”吗？该社区下已添加的服务器和在线玩家记录将一并移除。`,
      okText: '确认删除',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteCommunity(community.id);

          if (selectedCommunity?.id === community.id) {
            setSelectedCommunity(null);
            setServerDrawerVisible(false);
            setServerDraft(createEmptyServerDraft());
          }

          if (serverSettingsTarget?.communityId === community.id) {
            setServerSettingsTarget(null);
            setServerSettingsVisible(false);
            setServerSettingsDraft(createEmptyServerSettingsDraft());
          }

          if (playerDrawerTarget?.communityId === community.id) {
            setPlayerDrawerTarget(null);
            setPlayerDrawerVisible(false);
          }

          if (playerActionTarget?.communityId === community.id) {
            closePlayerActionModal();
          }

          if (serverListCommunityId === community.id) {
            closeServerListDrawer();
          }

          Message.success(`社区“${community.name}”已删除`);
        } catch (error) {
          Message.error(getErrorMessage(error, '社区删除失败'));
          throw error;
        }
      },
    });
  };

  const handleDeleteServer = (community: Community, server: Server) => {
    Modal.confirm({
      title: '删除服务器',
      content: `确认删除服务器“${server.name}”（${server.ip}:${server.port}）吗？该服务器下的在线玩家记录将一并移除。`,
      okText: '确认删除',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteServer(community.id, server.id);

          if (serverSettingsTarget?.communityId === community.id && serverSettingsTarget.serverId === server.id) {
            setServerSettingsTarget(null);
            setServerSettingsVisible(false);
            setServerSettingsDraft(createEmptyServerSettingsDraft());
          }

          if (playerDrawerTarget?.communityId === community.id && playerDrawerTarget.serverId === server.id) {
            setPlayerDrawerTarget(null);
            setPlayerDrawerVisible(false);
          }

          if (playerActionTarget?.communityId === community.id && playerActionTarget.serverId === server.id) {
            closePlayerActionModal();
          }

          Message.success(`服务器“${server.name}”已删除`);
        } catch (error) {
          Message.error(getErrorMessage(error, '服务器删除失败'));
          throw error;
        }
      },
    });
  };

  const handleCreateServer = async () => {
    if (!selectedCommunity) {
      return;
    }

    const errorMessage = validateServerDraft(serverDraft);

    if (errorMessage) {
      Message.warning(errorMessage);
      return;
    }

    if (!serverDraftVerified) {
      Message.warning('请先完成 RCON 校验后再添加服务器');
      return;
    }

    setSubmittingServer(true);

    try {
      await addServer(selectedCommunity.id, serverDraft);
      setServerDrawerVisible(false);
      setServerDraft(createEmptyServerDraft());
      setServerVerification(null);
      Message.success('RCON 验证通过，服务器已添加');
    } catch (error) {
      Message.error(getErrorMessage(error, '服务器添加失败'));
    } finally {
      setSubmittingServer(false);
    }
  };

  const handleUpdateServer = async () => {
    if (!serverSettingsTarget || !serverSettingsContext) {
      return;
    }

    const errorMessage = validateServerDraft(serverSettingsDraft);

    if (errorMessage) {
      Message.warning(errorMessage);
      return;
    }

    setSubmittingServerSettings(true);

    try {
      await updateServer(serverSettingsTarget.communityId, serverSettingsTarget.serverId, serverSettingsDraft);
      setServerSettingsVisible(false);
      setServerSettingsTarget(null);
      Message.success('服务器设置已更新');
    } catch (error) {
      Message.error(getErrorMessage(error, '服务器设置更新失败'));
    } finally {
      setSubmittingServerSettings(false);
    }
  };

  const handleConfirmPlayerAction = async () => {
    if (!playerActionTarget || !playerActionContext) {
      closePlayerActionModal();
      return;
    }

    const reason = playerActionReason.trim();

    if (!reason) {
      Message.warning(playerActionTarget.actionType === 'ban' ? '请输入封禁理由' : '请输入踢出理由');
      return;
    }

    const durationSeconds = banMode === 'temporary' ? Number(banDurationSeconds ?? 0) : undefined;

    if (playerActionTarget.actionType === 'ban' && banMode === 'temporary' && (durationSeconds ?? 0) < 1) {
      Message.warning('封禁秒数必须大于 0');
      return;
    }

    setSubmittingPlayerAction(true);

    try {
      if (playerActionTarget.actionType === 'ban') {
        await banServerPlayer(playerActionTarget.communityId, playerActionTarget.serverId, playerActionTarget.playerId, {
          banType,
          reason,
          durationSeconds,
          ipAddress: playerActionContext.player.ipAddress,
        });
        Message.success(
          `已按${banTypeLabelMap[banType]}封禁 ${playerActionContext.player.nickname}，封禁时长：${getBanDurationLabel(durationSeconds === 0 ? undefined : durationSeconds)}`,
        );
      } else {
        await kickServerPlayer(playerActionTarget.communityId, playerActionTarget.serverId, playerActionTarget.playerId, reason);
        Message.success(`已踢出 ${playerActionContext.player.nickname}`);
      }

      closePlayerActionModal();
    } catch (error) {
      Message.error(getErrorMessage(error, playerActionTarget.actionType === 'ban' ? '玩家封禁失败' : '玩家踢出失败'));
    } finally {
      setSubmittingPlayerAction(false);
    }
  };

  const renderServerList = (community: Community, servers: Server[]) => (
    <Space direction="vertical" size="medium" style={{ width: '100%' }} className="community-server-list">
      {servers.map((server) => (
        <div className="server-item" key={server.id}>
          <div className="server-item-header">
            <Space direction="vertical" size="small" style={{ flex: 1 }}>
              <Space align="center" size="small" wrap>
                <Typography.Text style={{ fontWeight: 600 }}>{server.name}</Typography.Text>
                <Tag color="green">RCON 已验证</Tag>
                <Tag color={server.whitelistEnabled ? 'green' : 'gray'}>
                  白名单{server.whitelistEnabled ? '开启' : '关闭'}
                </Tag>
                <Tag color={server.entryVerificationEnabled ? 'arcoblue' : 'gray'}>
                  进服验证{server.entryVerificationEnabled ? '开启' : '关闭'}
                </Tag>
                {server.entryVerificationEnabled ? (
                  <>
                    <Tag color="purple">Rating ≥ {server.minEntryRating}</Tag>
                    <Tag color="gold">Steam 等级 ≥ {server.minSteamLevel}</Tag>
                  </>
                ) : null}
              </Space>

              <Space size="small" wrap>
                <Tag>服务器 ID：{server.id}</Tag>
                <Tag>
                  {server.ip}:{server.port}
                </Tag>
                <Tag color="orange">在线 {server.onlinePlayers.length} 人</Tag>
                {server.playerReportedAt ? (
                  <Tag color="arcoblue">最近上报 {formatTime(server.playerReportedAt)}</Tag>
                ) : (
                  <Tag color="gray">暂无在线上报</Tag>
                )}
                <Typography.Text type="secondary">最近验证时间 {formatTime(server.rconVerifiedAt)}</Typography.Text>
              </Space>

              <Typography.Text type="secondary">{getServerAccessSummary(server)}</Typography.Text>
            </Space>

            <Space size="small" wrap>
              <Button size="small" onClick={() => openServerSettingsDrawer(community.id, server)}>
                服务器设置
              </Button>
              <Button size="small" type="outline" onClick={() => { void openPlayerDrawer(community.id, server.id); }}>
                玩家管理
              </Button>
              <Button
                size="small"
                type="outline"
                status="danger"
                icon={<IconDelete />}
                onClick={() => handleDeleteServer(community, server)}
              >
                删除服务器
              </Button>
            </Space>
          </div>
        </div>
      ))}
    </Space>
  );

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card className="page-header-card">
        <Space direction="vertical" size="large" className="page-header-stack">
          <div className="page-toolbar">
            <div className="page-toolbar-copy">
              <Typography.Title className="page-toolbar-title" heading={4}>
                社区组管理
              </Typography.Title>
              <Typography.Paragraph className="page-toolbar-description" type="secondary">
                网站管理员可按服务器单独维护连接参数、白名单与进服验证开关，并直接对在线玩家执行封禁或踢出操作。
              </Typography.Paragraph>
            </div>

            <div className="page-toolbar-actions">
              <Tag color="arcoblue">社区 {state.communities.length}</Tag>
              <Tag color="green">服务器 {totalServerCount}</Tag>
              <Tag color="orange">在线玩家 {totalOnlinePlayerCount}</Tag>
              <Button type="primary" icon={<IconPlus />} loading={submittingCommunity} onClick={() => setCommunityModalVisible(true)}>
                添加社区
              </Button>
            </div>
          </div>

          <Alert
            type="info"
            showIcon
            content={`当前共有 ${state.communities.length} 个社区，已接入 ${totalServerCount} 台服务器，在线玩家 ${totalOnlinePlayerCount} 人。当前接口模式：${apiMode === 'http' ? 'HTTP API' : 'Mock API'}${bootstrapping ? '，正在加载…' : ''}`}
          />

          {apiError ? <Alert type="warning" showIcon content={`接口提示：${apiError}`} /> : null}
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        {state.communities.map((community) => {
          const onlinePlayers = community.servers.reduce((count, server) => count + server.onlinePlayers.length, 0);

          return (
            <Col xs={24} lg={12} key={community.id}>
              <Card className="section-card community-card">
                <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                  <div className="community-card-header">
                    <div className="community-card-header-main">
                      <Typography.Title heading={6} className="community-card-heading">
                        {community.name}
                      </Typography.Title>
                    </div>

                    <Space size="small" wrap className="community-card-actions">
                      <Button type="outline" size="small" onClick={() => openServerDrawer(community)}>
                        添加服务器
                      </Button>
                      <Button type="outline" size="small" icon={<IconEdit />} onClick={() => openCommunityEditModal(community)}>
                        编辑社区
                      </Button>
                      <Button
                        type="outline"
                        size="small"
                        status="danger"
                        icon={<IconDelete />}
                        onClick={() => handleDeleteCommunity(community)}
                      >
                        删除社区
                      </Button>
                    </Space>
                  </div>

                  <Space size="small" wrap>
                    <Tag color="arcoblue">创建于 {formatTime(community.createdAt)}</Tag>
                    <Tag color="green">{community.servers.length} 台服务器</Tag>
                    <Tag color="orange">{onlinePlayers} 名在线玩家</Tag>
                  </Space>

                  <Divider style={{ margin: 0 }} />

                  {community.servers.length ? (
                    <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                      {renderServerList(community, community.servers.slice(0, COMMUNITY_SERVER_PREVIEW_COUNT))}

                      {community.servers.length > COMMUNITY_SERVER_PREVIEW_COUNT ? (
                        <div className="community-server-preview-footer">
                          <Typography.Text type="secondary">
                            当前仅预览前 {COMMUNITY_SERVER_PREVIEW_COUNT} 台服务器，另外 {community.servers.length - COMMUNITY_SERVER_PREVIEW_COUNT}
                            台服务器可在抽屉中查看。
                          </Typography.Text>
                          <Button size="small" type="outline" onClick={() => openServerListDrawer(community.id)}>
                            查看全部服务器
                          </Button>
                        </div>
                      ) : null}
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">当前社区还没有服务器，请先添加并完成 RCON 校验。</Typography.Text>
                  )}
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Drawer
        title={serverListCommunity ? `服务器列表 · ${serverListCommunity.name}` : '服务器列表'}
        width={720}
        visible={Boolean(serverListCommunity)}
        onCancel={closeServerListDrawer}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {serverListCommunity ? (
            <>
              <Alert
                type="info"
                showIcon
                content={`当前社区共有 ${serverListCommunity.servers.length} 台服务器，在线玩家 ${serverListCommunity.servers.reduce((count, server) => count + server.onlinePlayers.length, 0)} 人。`}
              />
              <Space size="small" wrap>
                <Tag color="green">服务器 {serverListCommunity.servers.length} 台</Tag>
                <Tag color="orange">在线玩家 {serverListCommunity.servers.reduce((count, server) => count + server.onlinePlayers.length, 0)} 人</Tag>
              </Space>
              <div className="community-server-drawer-list">{renderServerList(serverListCommunity, serverListCommunity.servers)}</div>
            </>
          ) : (
            <Empty description="未找到社区信息" />
          )}
        </Space>
      </Drawer>

      <Modal
        title="添加社区"
        visible={communityModalVisible}
        confirmLoading={submittingCommunity}
        onOk={() => {
          void handleCreateCommunity();
        }}
        onCancel={() => {
          setCommunityModalVisible(false);
          setCommunityName('');
        }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Text>社区名称</Typography.Text>
          <Input allowClear placeholder="例如：HighTower KZ 社区" value={communityName} onChange={setCommunityName} />
        </Space>
      </Modal>

      <Modal
        title={editingCommunity ? `编辑社区 · ${editingCommunity.name}` : '编辑社区'}
        visible={communityEditModalVisible}
        confirmLoading={submittingCommunityEdit}
        onOk={() => {
          void handleUpdateCommunity();
        }}
        onCancel={closeCommunityEditModal}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Text>社区名称</Typography.Text>
          <Input
            allowClear
            placeholder="请输入新的社区名称"
            value={editingCommunityName}
            onChange={setEditingCommunityName}
          />
        </Space>
      </Modal>

      <Drawer
        title={selectedCommunity ? `为 ${selectedCommunity.name} 添加服务器` : '添加服务器'}
        width={460}
        visible={serverDrawerVisible}
        confirmLoading={submittingServer}
        onOk={() => {
          void handleCreateServer();
        }}
        onCancel={() => {
          setServerDrawerVisible(false);
          setServerDraft(createEmptyServerDraft());
          setServerVerification(null);
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert type="info" showIcon content="添加服务器时需要先验证当前 IP、端口和 RCON 密码；开启进服验证后还可以设置最低进服 rating 和最低 Steam 等级。" />

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>服务器名称</Typography.Text>
            <Input
              allowClear
              placeholder="例如：Skyline #5 Match"
              value={serverDraft.name}
              onChange={(value) => setServerDraft((draft) => ({ ...draft, name: value }))}
            />
          </Space>

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>服务器 IP</Typography.Text>
            <Input
              allowClear
              placeholder="例如：123.45.67.89"
              value={serverDraft.ip}
              onChange={(value) => setServerDraft((draft) => ({ ...draft, ip: value }))}
            />
          </Space>

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>端口</Typography.Text>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={65535}
              value={serverDraft.port}
              onChange={(value) => setServerDraft((draft) => ({ ...draft, port: Number(value ?? 0) }))}
            />
          </Space>

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>RCON 密码</Typography.Text>
            <Input.Password
              placeholder="请输入服务器 RCON 密码"
              value={serverDraft.rconPassword}
              onChange={(value) => setServerDraft((draft) => ({ ...draft, rconPassword: value }))}
            />
          </Space>

          <div className="server-setting-row">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Typography.Text style={{ fontWeight: 600 }}>RCON 校验</Typography.Text>
              <Typography.Text type="secondary">添加前必须验证当前服务器地址与 RCON 密码能够成功连接。</Typography.Text>
              <Space size="small" wrap>
                <Tag color={serverDraftVerified ? 'green' : serverDraftVerificationStale ? 'orange' : 'gray'}>
                  {serverDraftVerified ? '已完成校验' : serverDraftVerificationStale ? '参数已变更，请重新校验' : '尚未校验'}
                </Tag>
                {serverDraftVerified && serverVerification ? (
                  <Tag color="arcoblue">校验时间 {formatTime(serverVerification.verifiedAt)}</Tag>
                ) : null}
              </Space>
            </Space>
            <Button
              size="small"
              type="outline"
              loading={verifyingServer}
              onClick={() => {
                void handleVerifyServerDraft();
              }}
            >
              验证 RCON
            </Button>
          </div>

          <Divider style={{ margin: 0 }} />

          <div className="server-setting-row">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Typography.Text style={{ fontWeight: 600 }}>白名单</Typography.Text>
              <Typography.Text type="secondary">开启后仅允许白名单玩家进入该服务器。</Typography.Text>
            </Space>
            <Switch
              checked={serverDraft.whitelistEnabled}
              onChange={(checked) => setServerDraft((draft) => ({ ...draft, whitelistEnabled: checked }))}
            />
          </div>

          <div className="server-setting-row">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Typography.Text style={{ fontWeight: 600 }}>进服验证</Typography.Text>
              <Typography.Text type="secondary">开启后玩家进服时需要额外通过验证流程。</Typography.Text>
            </Space>
            <Switch
              checked={serverDraft.entryVerificationEnabled}
              onChange={(checked) => setServerDraft((draft) => ({ ...draft, entryVerificationEnabled: checked }))}
            />
          </div>

          {serverDraft.entryVerificationEnabled ? (
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-item-label">最小进服 rating</span>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  value={serverDraft.minEntryRating}
                  onChange={(value) => setServerDraft((draft) => ({ ...draft, minEntryRating: Number(value ?? 0) }))}
                />
              </div>
              <div className="detail-item">
                <span className="detail-item-label">最小 Steam 等级</span>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  value={serverDraft.minSteamLevel}
                  onChange={(value) => setServerDraft((draft) => ({ ...draft, minSteamLevel: Number(value ?? 0) }))}
                />
              </div>
            </div>
          ) : null}
        </Space>
      </Drawer>

      <Drawer
        title={serverSettingsContext ? `服务器设置 · ${serverSettingsContext.server.name}` : '服务器设置'}
        width={460}
        visible={serverSettingsVisible}
        confirmLoading={submittingServerSettings}
        onOk={() => {
          void handleUpdateServer();
        }}
        onCancel={() => {
          setServerSettingsVisible(false);
          setServerSettingsTarget(null);
          setServerSettingsDraft(createEmptyServerSettingsDraft());
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert type="info" showIcon content="可单独修改服务器 IP、端口、RCON 密码，以及白名单、进服验证和进服验证门槛。" />

          {serverSettingsContext ? (
            <Space size="small" wrap>
              <Tag color="arcoblue">所属社区：{serverSettingsContext.community.name}</Tag>
              <Tag>
                当前地址：{serverSettingsContext.server.ip}:{serverSettingsContext.server.port}
              </Tag>
            </Space>
          ) : null}

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>服务器 IP</Typography.Text>
            <Input
              allowClear
              placeholder="例如：123.45.67.89"
              value={serverSettingsDraft.ip}
              onChange={(value) => setServerSettingsDraft((draft) => ({ ...draft, ip: value }))}
            />
          </Space>

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>端口</Typography.Text>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={65535}
              value={serverSettingsDraft.port}
              onChange={(value) => setServerSettingsDraft((draft) => ({ ...draft, port: Number(value ?? 0) }))}
            />
          </Space>

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>RCON 密码</Typography.Text>
            <Input.Password
              placeholder="请输入服务器 RCON 密码"
              value={serverSettingsDraft.rconPassword}
              onChange={(value) => setServerSettingsDraft((draft) => ({ ...draft, rconPassword: value }))}
            />
          </Space>

          <Divider style={{ margin: 0 }} />

          <div className="server-setting-row">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Typography.Text style={{ fontWeight: 600 }}>白名单</Typography.Text>
              <Typography.Text type="secondary">开启后仅允许白名单玩家进入该服务器。</Typography.Text>
            </Space>
            <Switch
              checked={serverSettingsDraft.whitelistEnabled}
              onChange={(checked) => setServerSettingsDraft((draft) => ({ ...draft, whitelistEnabled: checked }))}
            />
          </div>

          <div className="server-setting-row">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Typography.Text style={{ fontWeight: 600 }}>进服验证</Typography.Text>
              <Typography.Text type="secondary">开启后玩家进服时需要额外通过验证流程。</Typography.Text>
            </Space>
            <Switch
              checked={serverSettingsDraft.entryVerificationEnabled}
              onChange={(checked) => setServerSettingsDraft((draft) => ({ ...draft, entryVerificationEnabled: checked }))}
            />
          </div>

          {serverSettingsDraft.entryVerificationEnabled ? (
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-item-label">最小进服 rating</span>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  value={serverSettingsDraft.minEntryRating}
                  onChange={(value) =>
                    setServerSettingsDraft((draft) => ({ ...draft, minEntryRating: Number(value ?? 0) }))
                  }
                />
              </div>
              <div className="detail-item">
                <span className="detail-item-label">最小 Steam 等级</span>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  value={serverSettingsDraft.minSteamLevel}
                  onChange={(value) =>
                    setServerSettingsDraft((draft) => ({ ...draft, minSteamLevel: Number(value ?? 0) }))
                  }
                />
              </div>
            </div>
          ) : null}
        </Space>
      </Drawer>

      <Drawer
        title={playerDrawerContext ? `玩家管理 · ${playerDrawerContext.server.name}` : '玩家管理'}
        width={560}
        visible={playerDrawerVisible}
        onCancel={() => {
          setPlayerDrawerVisible(false);
          setPlayerDrawerTarget(null);
          setLoadingPlayerDrawer(false);
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert type="info" showIcon content="踢出和封禁都需要填写理由；封禁默认永久封禁，也可改为按秒设置时长。" />

          {playerDrawerContext ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Space size="small" wrap>
                <Tag color="arcoblue">所属社区：{playerDrawerContext.community.name}</Tag>
                <Tag>服务器 ID：{playerDrawerContext.server.id}</Tag>
                <Tag>
                  服务器地址：{playerDrawerContext.server.ip}:{playerDrawerContext.server.port}
                </Tag>
                <Tag color="orange">在线玩家 {playerDrawerContext.server.onlinePlayers.length} 人</Tag>
                {playerDrawerContext.server.playerReportedAt ? (
                  <Tag color="green">最近上报 {formatTime(playerDrawerContext.server.playerReportedAt)}</Tag>
                ) : (
                  <Tag color="gray">插件暂未上报在线玩家</Tag>
                )}
              </Space>
              <Space size="small" wrap>
                <Button size="small" loading={loadingPlayerDrawer} onClick={() => { void handleRefreshPlayerDrawer(); }}>
                  刷新在线玩家
                </Button>
                <Typography.Text type="secondary">该列表来自安装在游戏服上的 SourceMod 1.11 插件实时上报。</Typography.Text>
              </Space>
            </Space>
          ) : null}

          {loadingPlayerDrawer ? <Alert type="info" showIcon content="正在从后端加载该服务器的实时在线玩家..." /> : null}

          {playerDrawerContext?.server.onlinePlayers.length ? (
            <Space direction="vertical" size="medium" style={{ width: '100%' }}>
              {playerDrawerContext.server.onlinePlayers.map((player) => (
                <Card size="small" key={player.id} className="player-card">
                  <div className="player-card-header">
                    <Space direction="vertical" size="small" style={{ flex: 1 }}>
                      <Space align="center" size="small" wrap>
                        <Typography.Text style={{ fontWeight: 600 }}>{player.nickname}</Typography.Text>
                        <Tag color="arcoblue">UID {player.userId}</Tag>
                        <Tag>{player.steamId}</Tag>
                        {player.steamId64 ? <Tag color="purple">{player.steamId64}</Tag> : null}
                        {player.steamId3 ? <Tag color="cyan">{player.steamId3}</Tag> : null}
                        <Tag>IP {player.ipAddress}</Tag>
                        <Tag color="arcoblue">Ping {player.ping}</Tag>
                      </Space>
                      <Typography.Text type="secondary">
                        连接时间：{formatTime(player.connectedAt)}
                        {player.lastReportedAt ? ` · 最近上报 ${formatTime(player.lastReportedAt)}` : ''}
                      </Typography.Text>
                    </Space>

                    <Space size="small" wrap>
                      <Button
                        size="small"
                        onClick={() =>
                          openPlayerActionModal({
                            communityId: playerDrawerContext.community.id,
                            serverId: playerDrawerContext.server.id,
                            playerId: player.id,
                            actionType: 'kick',
                          })
                        }
                      >
                        踢出玩家
                      </Button>
                      <Button
                        size="small"
                        type="outline"
                        status="danger"
                        onClick={() =>
                          openPlayerActionModal({
                            communityId: playerDrawerContext.community.id,
                            serverId: playerDrawerContext.server.id,
                            playerId: player.id,
                            actionType: 'ban',
                          })
                        }
                      >
                        封禁玩家
                      </Button>
                    </Space>
                  </div>
                </Card>
              ))}
            </Space>
          ) : loadingPlayerDrawer ? null : (
            <Empty description="当前服务器没有在线玩家" />
          )}
        </Space>
      </Drawer>

      <Modal
        title={playerActionTarget?.actionType === 'ban' ? '封禁玩家' : '踢出玩家'}
        visible={Boolean(playerActionTarget)}
        confirmLoading={submittingPlayerAction}
        onOk={() => {
          void handleConfirmPlayerAction();
        }}
        onCancel={closePlayerActionModal}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {playerActionContext ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Space size="small" wrap>
                <Tag color="arcoblue">玩家：{playerActionContext.player.nickname}</Tag>
                <Tag>{playerActionContext.player.steamId}</Tag>
                <Tag>IP：{playerActionContext.player.ipAddress}</Tag>
                <Tag>
                  所在服务器：{playerActionContext.server.name}
                </Tag>
              </Space>
              <Typography.Text type="secondary">当前在线于 {playerActionContext.community.name}</Typography.Text>
            </Space>
          ) : null}

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>{playerActionTarget?.actionType === 'ban' ? '封禁理由' : '踢出理由'}</Typography.Text>
            <Input.TextArea
              placeholder={playerActionTarget?.actionType === 'ban' ? '请输入封禁理由' : '请输入踢出理由'}
              value={playerActionReason}
              onChange={setPlayerActionReason}
              autoSize={{ minRows: 3, maxRows: 5 }}
            />
          </Space>

          {playerActionTarget?.actionType === 'ban' ? (
            <>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Typography.Text>封禁属性</Typography.Text>
                <Radio.Group type="button" value={banType} onChange={(value) => setBanType(value as BanType)}>
                  <Radio value="steam_account">Steam账号封禁</Radio>
                  <Radio value="ip">IP封禁</Radio>
                </Radio.Group>
                <Typography.Text type="secondary">{getBanTypeDescription(banType)}</Typography.Text>
              </Space>

              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Typography.Text>封禁时长</Typography.Text>
                <Radio.Group
                  type="button"
                  value={banMode}
                  onChange={(value) => {
                    const nextValue = value as 'permanent' | 'temporary';
                    setBanMode(nextValue);

                    if (nextValue === 'temporary' && !banDurationSeconds) {
                      setBanDurationSeconds(600);
                    }
                  }}
                >
                  <Radio value="permanent">永久封禁</Radio>
                  <Radio value="temporary">自定义秒数</Radio>
                </Radio.Group>
              </Space>

              {banMode === 'temporary' ? (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Typography.Text>封禁秒数</Typography.Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    value={banDurationSeconds}
                    onChange={(value) => setBanDurationSeconds(Number(value ?? 0))}
                  />
                  <Typography.Text type="secondary">当前设置：{getBanDurationLabel(banDurationSeconds)}</Typography.Text>
                </Space>
              ) : (
                <Alert type="info" showIcon content="当前为永久封禁，如需临时封禁可切换为自定义秒数。" />
              )}
            </>
          ) : (
            <Alert type="warning" showIcon content="踢出不会记录时长，但必须填写理由。" />
          )}
        </Space>
      </Modal>
    </Space>
  );
};
