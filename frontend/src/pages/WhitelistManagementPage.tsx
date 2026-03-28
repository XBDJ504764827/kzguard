import {
  Alert,
  Button,
  Card,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { IconPlus } from '@arco-design/web-react/icon';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';
import type { ManualWhitelistDraft, WhitelistPlayer, WhitelistPlayerUpdateDraft, WhitelistRestriction, WhitelistStatus } from '../types';
import { getErrorMessage } from '../utils/error';
import { websiteAdminRoleColorMap, websiteAdminRoleLabelMap } from '../utils/websiteAdmin';

const TabPane = Tabs.TabPane;
const Option = Select.Option;

const WHITELIST_ACTIVE_TAB_STORAGE_KEY = 'kzguard_whitelist_active_tab';

type WhitelistManagementTab = WhitelistStatus | 'restricted';

interface RestrictionModalTarget {
  playerId: string;
  nickname: string;
  existing: boolean;
}

const isWhitelistManagementTab = (value: string | null): value is WhitelistManagementTab =>
  value === 'approved' || value === 'pending' || value === 'rejected' || value === 'restricted';

const getInitialActiveTab = (): WhitelistManagementTab => {
  const storedTab = globalThis.window?.localStorage?.getItem(WHITELIST_ACTIVE_TAB_STORAGE_KEY) ?? null;
  return isWhitelistManagementTab(storedTab) ? storedTab : 'pending';
};

const createEmptyManualDraft = (): ManualWhitelistDraft => ({
  nickname: '',
  steamId: '',
  contact: '',
  note: '',
  status: 'approved',
});

const createEmptyUpdateDraft = (): WhitelistPlayerUpdateDraft => ({
  nickname: '',
  steamId: '',
  contact: '',
  note: '',
});

const createUpdateDraftFromPlayer = (player: WhitelistPlayer): WhitelistPlayerUpdateDraft => ({
  nickname: player.nickname,
  steamId: player.steamId64 || player.steamId || player.steamId3 || '',
  contact: player.contact ?? '',
  note: player.note ?? '',
});

const formatTime = (value?: string) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const statusTextMap: Record<WhitelistStatus, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已拒绝',
};

const statusColorMap: Record<WhitelistStatus, 'green' | 'orange' | 'red'> = {
  approved: 'green',
  pending: 'orange',
  rejected: 'red',
};

const sourceTextMap: Record<WhitelistPlayer['source'], string> = {
  manual: '管理员手动添加',
  application: '玩家申请',
};

const validatePlayerDraft = (nickname: string, steamId: string) => {
  if (!nickname.trim()) {
    return '请输入玩家昵称';
  }

  if (!steamId.trim()) {
    return '请输入 Steam 标识';
  }

  return null;
};

export const WhitelistManagementPage = () => {
  const {
    state,
    currentAdmin,
    approvePlayer,
    rejectPlayer,
    manualAddPlayer,
    updateWhitelistPlayer,
    deleteWhitelistPlayer,
    addWhitelistRestriction,
    updateWhitelistRestriction,
    deleteWhitelistRestriction,
    apiMode,
    apiError,
    bootstrapping,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<WhitelistManagementTab>(getInitialActiveTab);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualWhitelistDraft>(createEmptyManualDraft);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<WhitelistPlayerUpdateDraft>(createEmptyUpdateDraft);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [submittingManual, setSubmittingManual] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [submittingReject, setSubmittingReject] = useState(false);
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [approvingPlayerId, setApprovingPlayerId] = useState<string | null>(null);
  const [restrictionTarget, setRestrictionTarget] = useState<RestrictionModalTarget | null>(null);
  const [restrictionServerIds, setRestrictionServerIds] = useState<string[]>([]);
  const [submittingRestriction, setSubmittingRestriction] = useState(false);

  const isSystemAdmin = currentAdmin?.role === 'system_admin';

  useEffect(() => {
    globalThis.window?.localStorage?.setItem(WHITELIST_ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!isSystemAdmin && activeTab === 'restricted') {
      setActiveTab('pending');
    }
  }, [activeTab, isSystemAdmin]);

  const groupedPlayers = useMemo(
    () => ({
      approved: state.whitelist.filter((player) => player.status === 'approved'),
      pending: state.whitelist.filter((player) => player.status === 'pending'),
      rejected: state.whitelist.filter((player) => player.status === 'rejected'),
    }),
    [state.whitelist],
  );

  const restrictionByPlayerId = useMemo(
    () => new Map(state.whitelistRestrictions.map((restriction) => [restriction.playerId, restriction])),
    [state.whitelistRestrictions],
  );

  const serverOptions = useMemo(
    () =>
      state.communities.flatMap((community) =>
        community.servers.map((server) => ({
          value: server.id,
          label: `${community.name} / ${server.name} (${server.ip}:${server.port})`,
        })),
      ),
    [state.communities],
  );
  const serverNameMap = useMemo(
    () => new Map(serverOptions.map((option) => [option.value, option.label])),
    [serverOptions],
  );

  const editingPlayer = useMemo(
    () => state.whitelist.find((player) => player.id === editTargetId) ?? null,
    [editTargetId, state.whitelist],
  );
  const rejectingPlayer = useMemo(
    () => state.whitelist.find((player) => player.id === rejectTargetId) ?? null,
    [rejectTargetId, state.whitelist],
  );
  const deletingPlayer = useMemo(
    () => state.whitelist.find((player) => player.id === deleteTargetId) ?? null,
    [deleteTargetId, state.whitelist],
  );

  const openRestrictionModal = (restriction: WhitelistRestriction) => {
    setRestrictionTarget({
      playerId: restriction.playerId,
      nickname: restriction.nickname,
      existing: true,
    });
    setRestrictionServerIds(restriction.allowedServerIds);
  };

  const openCreateRestrictionModal = (player: WhitelistPlayer) => {
    setRestrictionTarget({
      playerId: player.id,
      nickname: player.nickname,
      existing: false,
    });
    setRestrictionServerIds([]);
  };

  const handleSaveRestriction = async () => {
    if (!restrictionTarget) {
      return;
    }

    setSubmittingRestriction(true);

    try {
      if (restrictionTarget.existing) {
        await updateWhitelistRestriction(restrictionTarget.playerId, restrictionServerIds);
        Message.success('限制服务器已更新');
      } else {
        await addWhitelistRestriction(restrictionTarget.playerId, restrictionServerIds);
        Message.success(`已将 ${restrictionTarget.nickname} 添加到玩家限制页`);
      }
      setRestrictionTarget(null);
      setRestrictionServerIds([]);
      setActiveTab('restricted');
    } catch (error) {
      Message.error(
        getErrorMessage(error, restrictionTarget.existing ? '限制服务器更新失败' : '添加到限制页失败'),
      );
    } finally {
      setSubmittingRestriction(false);
    }
  };

  const handleRemoveRestriction = (restriction: WhitelistRestriction) => {
    Modal.confirm({
      title: '移出玩家限制页',
      content: `确认将 ${restriction.nickname} 移出玩家限制页吗？移出后该玩家将不再受单独服务器限制。`,
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        try {
          await deleteWhitelistRestriction(restriction.playerId);
          if (restrictionTarget?.playerId === restriction.playerId) {
            setRestrictionTarget(null);
            setRestrictionServerIds([]);
          }
          Message.success(`已将 ${restriction.nickname} 移出玩家限制页`);
        } catch (error) {
          Message.error(getErrorMessage(error, '移出限制页失败'));
          throw error;
        }
      },
    });
  };

  const restrictionColumns = [
    {
      title: '玩家信息',
      dataIndex: 'nickname',
      width: 340,
      render: (_value: string, record: WhitelistRestriction) => (
        <Space direction="vertical" size="mini">
          <Typography.Text style={{ fontWeight: 600 }}>{record.nickname}</Typography.Text>
          <Typography.Text type="secondary">联系方式：{record.contact || '-'}</Typography.Text>
          <Typography.Text type="secondary">SteamID64：{record.steamId64 || '-'}</Typography.Text>
          <Typography.Text type="secondary">SteamID：{record.steamId}</Typography.Text>
          <Typography.Text type="secondary">SteamID3：{record.steamId3 || '-'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '可进入服务器',
      dataIndex: 'allowedServerIds',
      render: (value: string[]) =>
        value.length ? (
          <Space size="mini" wrap>
            {value.map((serverId) => (
              <Tag key={serverId} color="arcoblue">{serverNameMap.get(serverId) || serverId}</Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">暂未设置；当前将无法进入任何服务器</Typography.Text>
        ),
    },
    {
      title: '操作',
      dataIndex: 'playerId',
      width: 260,
      render: (_value: string, record: WhitelistRestriction) => (
        <Space wrap size="mini">
          <Button size="small" type="primary" onClick={() => openRestrictionModal(record)}>
            设置可进服务器
          </Button>
          <Button size="small" status="danger" onClick={() => handleRemoveRestriction(record)}>
            移出限制页
          </Button>
        </Space>
      ),
    },
  ];

  const columns = [
    {
      title: '玩家信息',
      dataIndex: 'nickname',
      width: 320,
      render: (_value: string, record: WhitelistPlayer) => (
        <Space direction="vertical" size="mini">
          <Typography.Text style={{ fontWeight: 600 }}>{record.nickname}</Typography.Text>
          <Typography.Text type="secondary">联系方式：{record.contact || '-'}</Typography.Text>
          <Typography.Text type="secondary">SteamID64：{record.steamId64 || '-'}</Typography.Text>
          <Typography.Text type="secondary">SteamID：{record.steamId}</Typography.Text>
          <Typography.Text type="secondary">SteamID3：{record.steamId3 || '-'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 150,
      render: (value: WhitelistPlayer['source']) => <Tag>{sourceTextMap[value]}</Tag>,
    },
    {
      title: '备注 / 缘由',
      dataIndex: 'note',
      width: 240,
      render: (value?: string) => value || '-',
    },
    {
      title: '时间',
      dataIndex: 'appliedAt',
      width: 220,
      render: (_value: string, record: WhitelistPlayer) => (
        <Space direction="vertical" size="mini">
          <Typography.Text>申请：{formatTime(record.appliedAt)}</Typography.Text>
          <Typography.Text type="secondary">审核：{formatTime(record.reviewedAt)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (value: WhitelistStatus) => <Tag color={statusColorMap[value]}>{statusTextMap[value]}</Tag>,
    },
    {
      title: '操作',
      dataIndex: 'id',
      width: 420,
      render: (_value: string, record: WhitelistPlayer) => {
        const canReview = record.status === 'pending' && record.source === 'application';
        const restriction = restrictionByPlayerId.get(record.id);

        if (!canReview && !isSystemAdmin) {
          return <Typography.Text type="secondary">仅系统管理员可编辑或删除记录</Typography.Text>;
        }

        return (
          <Space wrap size="mini">
            {canReview ? (
              <Button
                type="primary"
                size="small"
                loading={approvingPlayerId === record.id}
                disabled={Boolean(approvingPlayerId && approvingPlayerId !== record.id)}
                onClick={async () => {
                  if (approvingPlayerId) {
                    return;
                  }

                  setApprovingPlayerId(record.id);
                  try {
                    await approvePlayer(record.id);
                    Message.success(`已通过 ${record.nickname} 的白名单申请`);
                  } catch (error) {
                    Message.error(getErrorMessage(error, '审核通过失败'));
                  } finally {
                    setApprovingPlayerId(null);
                  }
                }}
              >
                通过
              </Button>
            ) : null}
            {canReview ? (
              <Button
                size="small"
                status="danger"
                onClick={() => {
                  setRejectTargetId(record.id);
                  setRejectReason(record.note ?? '');
                }}
              >
                不通过
              </Button>
            ) : null}
            {isSystemAdmin ? (
              <Button
                size="small"
                onClick={() => {
                  setEditTargetId(record.id);
                  setEditDraft(createUpdateDraftFromPlayer(record));
                }}
              >
                编辑
              </Button>
            ) : null}
            {isSystemAdmin && record.status === 'approved' ? (
              restriction ? (
                <Button size="small" type="outline" onClick={() => openRestrictionModal(restriction)}>
                  设置限制服务器
                </Button>
              ) : (
                <Button size="small" type="outline" status="warning" onClick={() => openCreateRestrictionModal(record)}>
                  添加到限制页
                </Button>
              )
            ) : null}
            {isSystemAdmin ? (
              <Button
                size="small"
                status="danger"
                onClick={() => setDeleteTargetId(record.id)}
              >
                删除
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  const handleManualAdd = async () => {
    const errorMessage = validatePlayerDraft(manualDraft.nickname, manualDraft.steamId);

    if (errorMessage) {
      Message.warning(errorMessage);
      return;
    }

    setSubmittingManual(true);

    try {
      await manualAddPlayer(manualDraft);
      setManualModalVisible(false);
      setManualDraft(createEmptyManualDraft());
      setActiveTab(manualDraft.status);
      Message.success('玩家已由系统管理员手动加入白名单列表');
    } catch (error) {
      Message.error(getErrorMessage(error, '手动添加失败'));
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleEditPlayer = async () => {
    if (!editTargetId) {
      return;
    }

    const errorMessage = validatePlayerDraft(editDraft.nickname, editDraft.steamId);

    if (errorMessage) {
      Message.warning(errorMessage);
      return;
    }

    setSubmittingEdit(true);

    try {
      await updateWhitelistPlayer(editTargetId, editDraft);
      setEditTargetId(null);
      setEditDraft(createEmptyUpdateDraft());
      Message.success('白名单玩家信息已更新');
    } catch (error) {
      Message.error(getErrorMessage(error, '更新玩家信息失败'));
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleRejectPlayer = async () => {
    if (!rejectTargetId) {
      return;
    }

    if (!rejectReason.trim()) {
      Message.warning('请填写不通过缘由');
      return;
    }

    setSubmittingReject(true);

    try {
      await rejectPlayer(rejectTargetId, rejectReason);
      Message.success(`已拒绝 ${rejectingPlayer?.nickname ?? '该玩家'} 的白名单申请`);
      setRejectTargetId(null);
      setRejectReason('');
      setActiveTab('rejected');
    } catch (error) {
      Message.error(getErrorMessage(error, '审核拒绝失败'));
    } finally {
      setSubmittingReject(false);
    }
  };

  const handleDeletePlayer = async () => {
    if (!deleteTargetId) {
      return;
    }

    setSubmittingDelete(true);

    try {
      await deleteWhitelistPlayer(deleteTargetId);
      Message.success('白名单记录已删除');
      setDeleteTargetId(null);
    } catch (error) {
      Message.error(getErrorMessage(error, '删除白名单记录失败'));
    } finally {
      setSubmittingDelete(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card className="page-header-card">
        <Space direction="vertical" size="large" className="page-header-stack">
          <div className="page-toolbar">
            <div className="page-toolbar-copy">
              <Typography.Title className="page-toolbar-title" heading={4}>
                白名单管理
              </Typography.Title>
              <Typography.Paragraph className="page-toolbar-description" type="secondary">
                系统管理员可维护白名单玩家资料；普通管理员仅可审核玩家主动提交的申请，并且拒绝时必须填写缘由。
              </Typography.Paragraph>
            </div>

            <div className="page-toolbar-actions">
              {currentAdmin ? (
                <Tag color={websiteAdminRoleColorMap[currentAdmin.role]}>
                  当前角色：{websiteAdminRoleLabelMap[currentAdmin.role]}
                </Tag>
              ) : null}
              <Tag color="green">已通过 {groupedPlayers.approved.length}</Tag>
              <Tag color="orange">待审核 {groupedPlayers.pending.length}</Tag>
              <Tag color="red">已拒绝 {groupedPlayers.rejected.length}</Tag>
              <Tag color="purple">限制页 {state.whitelistRestrictions.length}</Tag>
              {isSystemAdmin ? (
                <Button type="primary" icon={<IconPlus />} onClick={() => setManualModalVisible(true)}>
                  管理员手动添加
                </Button>
              ) : null}
            </div>
          </div>

          <Alert
            type="info"
            showIcon
            content={`当前白名单流程接口模式：${apiMode === 'http' ? 'HTTP API' : 'Mock API'}${bootstrapping ? '，正在加载…' : ''}`}
          />

          <Alert
            type={isSystemAdmin ? 'info' : 'warning'}
            showIcon
            content={
              isSystemAdmin
                ? '系统管理员可手动录入、编辑、删除白名单记录，并可继续审核玩家申请；已通过玩家还可加入玩家限制页并单独配置可进入的服务器。'
                : '普通管理员仅可审核玩家主动提交的白名单申请，不能手动添加、编辑或删除记录；驳回时必须填写缘由。'
            }
          />

          {apiError ? <Alert type="warning" showIcon content={`接口提示：${apiError}`} /> : null}
        </Space>
      </Card>

      <Card className="table-card">
        <Tabs activeTab={activeTab} onChange={(value) => setActiveTab(value as WhitelistManagementTab)}>
          <TabPane key="approved" title={`已通过 (${groupedPlayers.approved.length})`}>
            <Table rowKey="id" columns={columns} data={groupedPlayers.approved} pagination={false} scroll={{ x: 1300 }} />
          </TabPane>
          <TabPane key="pending" title={`待审核 (${groupedPlayers.pending.length})`}>
            <Table rowKey="id" columns={columns} data={groupedPlayers.pending} pagination={false} scroll={{ x: 1300 }} />
          </TabPane>
          <TabPane key="rejected" title={`已拒绝 (${groupedPlayers.rejected.length})`}>
            <Table rowKey="id" columns={columns} data={groupedPlayers.rejected} pagination={false} scroll={{ x: 1300 }} />
          </TabPane>
          {isSystemAdmin ? (
            <TabPane key="restricted" title={`玩家限制页 (${state.whitelistRestrictions.length})`}>
              <Table rowKey="playerId" columns={restrictionColumns} data={state.whitelistRestrictions} pagination={false} scroll={{ x: 1300 }} />
            </TabPane>
          ) : null}
        </Tabs>
      </Card>

      <Modal
        title="系统管理员手动添加玩家"
        visible={manualModalVisible}
        confirmLoading={submittingManual}
        onOk={() => {
          void handleManualAdd();
        }}
        onCancel={() => {
          setManualModalVisible(false);
          setManualDraft(createEmptyManualDraft());
        }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Text>玩家昵称</Typography.Text>
          <Input
            allowClear
            value={manualDraft.nickname}
            onChange={(value) => setManualDraft((draft) => ({ ...draft, nickname: value }))}
            placeholder="例如：SkyWalker"
          />

          <Typography.Text>Steam 标识</Typography.Text>
          <Input
            allowClear
            value={manualDraft.steamId}
            onChange={(value) => setManualDraft((draft) => ({ ...draft, steamId: value }))}
            placeholder="例如：76561197960512640 / STEAM_1:0:123456 / [U:1:246912]"
          />

          <Typography.Text>联系方式</Typography.Text>
          <Input
            allowClear
            value={manualDraft.contact}
            onChange={(value) => setManualDraft((draft) => ({ ...draft, contact: value }))}
            placeholder="例如：qq / discord"
          />

          <Typography.Text>录入结果</Typography.Text>
          <Select value={manualDraft.status} onChange={(value) => setManualDraft((draft) => ({ ...draft, status: value }))}>
            <Option value="approved">已通过</Option>
            <Option value="rejected">已拒绝</Option>
          </Select>

          <Typography.Text>备注</Typography.Text>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 5 }}
            maxLength={100}
            value={manualDraft.note}
            onChange={(value) => setManualDraft((draft) => ({ ...draft, note: value }))}
            placeholder="可填写审核说明或补充备注"
          />
        </Space>
      </Modal>

      <Modal
        title={editingPlayer ? `编辑白名单玩家 · ${editingPlayer.nickname}` : '编辑白名单玩家'}
        visible={Boolean(editingPlayer)}
        confirmLoading={submittingEdit}
        onOk={() => {
          void handleEditPlayer();
        }}
        onCancel={() => {
          setEditTargetId(null);
          setEditDraft(createEmptyUpdateDraft());
        }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Text>玩家昵称</Typography.Text>
          <Input allowClear value={editDraft.nickname} onChange={(value) => setEditDraft((draft) => ({ ...draft, nickname: value }))} />

          <Typography.Text>Steam 标识</Typography.Text>
          <Input
            allowClear
            value={editDraft.steamId}
            onChange={(value) => setEditDraft((draft) => ({ ...draft, steamId: value }))}
            placeholder="优先填写 SteamID64"
          />

          <Typography.Text>联系方式</Typography.Text>
          <Input allowClear value={editDraft.contact} onChange={(value) => setEditDraft((draft) => ({ ...draft, contact: value }))} />

          <Typography.Text>备注</Typography.Text>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 5 }}
            maxLength={100}
            value={editDraft.note}
            onChange={(value) => setEditDraft((draft) => ({ ...draft, note: value }))}
            placeholder="可填写补充说明或保留空白"
          />
        </Space>
      </Modal>

      <Modal
        title={rejectingPlayer ? `驳回白名单申请 · ${rejectingPlayer.nickname}` : '驳回白名单申请'}
        visible={Boolean(rejectingPlayer)}
        confirmLoading={submittingReject}
        okButtonProps={{ status: 'danger' }}
        onOk={() => {
          void handleRejectPlayer();
        }}
        onCancel={() => {
          setRejectTargetId(null);
          setRejectReason('');
        }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Alert type="warning" showIcon content="驳回申请时必须填写明确缘由，玩家会依据该说明调整后重新申请。" />
          <Typography.Text>不通过缘由</Typography.Text>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 6 }}
            maxLength={200}
            value={rejectReason}
            onChange={setRejectReason}
            placeholder="例如：当前未提供社区身份信息，请补充 QQ 群名片或赛图记录后重新申请"
          />
        </Space>
      </Modal>

      <Modal
        title={restrictionTarget ? `${restrictionTarget.existing ? '设置限制服务器' : '添加到限制页'} · ${restrictionTarget.nickname}` : '设置限制服务器'}
        visible={Boolean(restrictionTarget)}
        confirmLoading={submittingRestriction}
        onOk={() => {
          void handleSaveRestriction();
        }}
        onCancel={() => {
          setRestrictionTarget(null);
          setRestrictionServerIds([]);
        }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            content={
              restrictionTarget?.existing
                ? '玩家已在限制页中；保存后会立即同步其可进入服务器列表。若不选择任何服务器，则该玩家当前无法进入任何服务器。'
                : '保存后会将该玩家加入限制页，并立即同步其可进入服务器列表。若不选择任何服务器，则该玩家当前无法进入任何服务器。'
            }
          />
          <Typography.Text>允许进入的服务器</Typography.Text>
          <Select
            mode="multiple"
            allowClear
            value={restrictionServerIds}
            onChange={(value) => setRestrictionServerIds(value as string[])}
            placeholder={serverOptions.length ? '请选择允许进入的服务器' : '当前没有可选服务器'}
          >
            {serverOptions.map((option) => (
              <Option key={option.value} value={option.value}>{option.label}</Option>
            ))}
          </Select>
          {restrictionServerIds.length ? (
            <Space size="mini" wrap>
              {restrictionServerIds.map((serverId) => (
                <Tag key={serverId} color="arcoblue">{serverNameMap.get(serverId) || serverId}</Tag>
              ))}
            </Space>
          ) : null}
        </Space>
      </Modal>

      <Modal
        title="删除白名单记录"
        visible={Boolean(deletingPlayer)}
        confirmLoading={submittingDelete}
        okButtonProps={{ status: 'danger' }}
        onOk={() => {
          void handleDeletePlayer();
        }}
        onCancel={() => setDeleteTargetId(null)}
      >
        <Typography.Text>
          确认删除 {deletingPlayer?.nickname ?? '该玩家'} 的白名单记录吗？删除后将无法恢复，并会立即同步更新服务器准入缓存。
        </Typography.Text>
      </Modal>
    </Space>
  );
};
