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
import { IconPlus } from '@arco-design/web-react/icon';
import { useMemo, useState } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';
import type { BanType, Community, Server, ServerDraft, ServerSettingsDraft } from '../types';
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
});

const createEmptyServerSettingsDraft = (): ServerSettingsDraft => ({
  ip: '',
  port: 27015,
  rconPassword: '',
  whitelistEnabled: false,
  entryVerificationEnabled: false,
});

const createServerSettingsDraft = (server: Server): ServerSettingsDraft => ({
  ip: server.ip,
  port: server.port,
  rconPassword: server.rconPassword,
  whitelistEnabled: server.whitelistEnabled ?? false,
  entryVerificationEnabled: server.entryVerificationEnabled ?? false,
});

const validateServerDraft = (
  draft: Pick<ServerDraft, 'ip' | 'port' | 'rconPassword'> & Partial<Pick<ServerDraft, 'name'>>,
) => {
  const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

  if (typeof draft.name === 'string' && !draft.name.trim()) {
    return '请输入服务器名称';
  }

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

const getServerAccessSummary = (server: Server) => {
  if (server.whitelistEnabled && server.entryVerificationEnabled) {
    return '当前已同时启用白名单和进服验证。';
  }

  if (server.whitelistEnabled) {
    return '当前仅开启白名单，适合受控开放服务器。';
  }

  if (server.entryVerificationEnabled) {
    return '当前仅开启进服验证，适合临时验权场景。';
  }

  return '当前未开启白名单和进服验证。';
};

export const CommunityManagementPage = () => {
  const {
    state,
    addCommunity,
    addServer,
    updateServer,
    kickServerPlayer,
    banServerPlayer,
    apiMode,
    apiError,
    bootstrapping,
  } = useAppStore();
  const [communityModalVisible, setCommunityModalVisible] = useState(false);
  const [serverDrawerVisible, setServerDrawerVisible] = useState(false);
  const [serverSettingsVisible, setServerSettingsVisible] = useState(false);
  const [playerDrawerVisible, setPlayerDrawerVisible] = useState(false);
  const [communityName, setCommunityName] = useState('');
  const [serverDraft, setServerDraft] = useState<ServerDraft>(createEmptyServerDraft);
  const [serverSettingsDraft, setServerSettingsDraft] = useState<ServerSettingsDraft>(createEmptyServerSettingsDraft);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [serverSettingsTarget, setServerSettingsTarget] = useState<ServerTarget | null>(null);
  const [playerDrawerTarget, setPlayerDrawerTarget] = useState<ServerTarget | null>(null);
  const [playerActionTarget, setPlayerActionTarget] = useState<PlayerActionTarget | null>(null);
  const [playerActionReason, setPlayerActionReason] = useState('');
  const [banType, setBanType] = useState<BanType>('steam_account');
  const [banMode, setBanMode] = useState<'permanent' | 'temporary'>('permanent');
  const [banDurationSeconds, setBanDurationSeconds] = useState<number | undefined>(undefined);
  const [submittingServer, setSubmittingServer] = useState(false);
  const [submittingCommunity, setSubmittingCommunity] = useState(false);
  const [submittingServerSettings, setSubmittingServerSettings] = useState(false);
  const [submittingPlayerAction, setSubmittingPlayerAction] = useState(false);

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

  const openServerDrawer = (community: Community) => {
    setSelectedCommunity(community);
    setServerDraft(createEmptyServerDraft());
    setServerDrawerVisible(true);
  };

  const openServerSettingsDrawer = (communityId: string, server: Server) => {
    setServerSettingsTarget({ communityId, serverId: server.id });
    setServerSettingsDraft(createServerSettingsDraft(server));
    setServerSettingsVisible(true);
  };

  const openPlayerDrawer = (communityId: string, serverId: string) => {
    setPlayerDrawerTarget({ communityId, serverId });
    setPlayerDrawerVisible(true);
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

  const handleCreateServer = async () => {
    if (!selectedCommunity) {
      return;
    }

    const errorMessage = validateServerDraft(serverDraft);

    if (errorMessage) {
      Message.warning(errorMessage);
      return;
    }

    setSubmittingServer(true);

    try {
      await addServer(selectedCommunity.id, serverDraft);
      setServerDrawerVisible(false);
      setServerDraft(createEmptyServerDraft());
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

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="page-toolbar">
        <div>
          <Typography.Title heading={4} style={{ marginBottom: 8 }}>
            社区组管理
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            网站管理员可按服务器单独维护连接参数、白名单与进服验证开关，并直接对在线玩家执行封禁或踢出操作。
          </Typography.Paragraph>
        </div>

        <Button type="primary" icon={<IconPlus />} loading={submittingCommunity} onClick={() => setCommunityModalVisible(true)}>
          添加社区
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        content={`当前共有 ${state.communities.length} 个社区，已接入 ${totalServerCount} 台服务器，在线玩家 ${totalOnlinePlayerCount} 人。当前接口模式：${apiMode === 'http' ? 'HTTP API' : 'Mock API'}${bootstrapping ? '，正在加载…' : ''}`}
      />

      {apiError ? <Alert type="warning" showIcon content={`接口提示：${apiError}`} /> : null}

      <Row gutter={[16, 16]}>
        {state.communities.map((community) => {
          const onlinePlayers = community.servers.reduce((count, server) => count + server.onlinePlayers.length, 0);

          return (
            <Col xs={24} lg={12} key={community.id}>
              <Card
                title={community.name}
                extra={
                  <Button type="outline" size="small" onClick={() => openServerDrawer(community)}>
                    添加服务器
                  </Button>
                }
              >
                <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                  <Space size="small" wrap>
                    <Tag color="arcoblue">创建于 {formatTime(community.createdAt)}</Tag>
                    <Tag color="green">{community.servers.length} 台服务器</Tag>
                    <Tag color="orange">{onlinePlayers} 名在线玩家</Tag>
                  </Space>

                  <Divider style={{ margin: 0 }} />

                  {community.servers.length ? (
                    <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                      {community.servers.map((server) => (
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
                              </Space>

                              <Space size="small" wrap>
                                <Tag>
                                  {server.ip}:{server.port}
                                </Tag>
                                <Tag color="orange">在线 {server.onlinePlayers.length} 人</Tag>
                                <Typography.Text type="secondary">最近验证时间 {formatTime(server.rconVerifiedAt)}</Typography.Text>
                              </Space>

                              <Typography.Text type="secondary">{getServerAccessSummary(server)}</Typography.Text>
                            </Space>

                            <Space size="small" wrap>
                              <Button size="small" onClick={() => openServerSettingsDrawer(community.id, server)}>
                                服务器设置
                              </Button>
                              <Button size="small" type="outline" onClick={() => openPlayerDrawer(community.id, server.id)}>
                                玩家管理
                              </Button>
                            </Space>
                          </div>
                        </div>
                      ))}
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
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert type="info" showIcon content="添加服务器时可直接设置白名单与进服验证开关，保存前会进行字段校验。" />

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
          <Alert type="info" showIcon content="可单独修改服务器 IP、端口、RCON 密码，以及白名单和进服验证开关。" />

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
        </Space>
      </Drawer>

      <Drawer
        title={playerDrawerContext ? `玩家管理 · ${playerDrawerContext.server.name}` : '玩家管理'}
        width={560}
        visible={playerDrawerVisible}
        onCancel={() => {
          setPlayerDrawerVisible(false);
          setPlayerDrawerTarget(null);
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert type="info" showIcon content="踢出和封禁都需要填写理由；封禁默认永久封禁，也可改为按秒设置时长。" />

          {playerDrawerContext ? (
            <Space size="small" wrap>
              <Tag color="arcoblue">所属社区：{playerDrawerContext.community.name}</Tag>
              <Tag>
                服务器地址：{playerDrawerContext.server.ip}:{playerDrawerContext.server.port}
              </Tag>
              <Tag color="orange">在线玩家 {playerDrawerContext.server.onlinePlayers.length} 人</Tag>
            </Space>
          ) : null}

          {playerDrawerContext?.server.onlinePlayers.length ? (
            <Space direction="vertical" size="medium" style={{ width: '100%' }}>
              {playerDrawerContext.server.onlinePlayers.map((player) => (
                <Card size="small" key={player.id} className="player-card">
                  <div className="player-card-header">
                    <Space direction="vertical" size="small" style={{ flex: 1 }}>
                      <Space align="center" size="small" wrap>
                        <Typography.Text style={{ fontWeight: 600 }}>{player.nickname}</Typography.Text>
                        <Tag>{player.steamId}</Tag>
                        <Tag>IP {player.ipAddress}</Tag>
                        <Tag color="arcoblue">Ping {player.ping}</Tag>
                      </Space>
                      <Typography.Text type="secondary">连接时间：{formatTime(player.connectedAt)}</Typography.Text>
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
          ) : (
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
