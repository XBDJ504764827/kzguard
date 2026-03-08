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
import { useMemo, useState } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';
import type { ManualWhitelistDraft, WhitelistPlayer, WhitelistPlayerUpdateDraft, WhitelistStatus } from '../types';
import { getErrorMessage } from '../utils/error';
import { websiteAdminRoleColorMap, websiteAdminRoleLabelMap } from '../utils/websiteAdmin';

const TabPane = Tabs.TabPane;
const Option = Select.Option;

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
  steamId: player.steamId64 || player.steamId || player.steamId3,
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
    apiMode,
    apiError,
    bootstrapping,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<WhitelistStatus>('pending');
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

  const isSystemAdmin = currentAdmin?.role === 'system_admin';

  const groupedPlayers = useMemo(
    () => ({
      approved: state.whitelist.filter((player) => player.status === 'approved'),
      pending: state.whitelist.filter((player) => player.status === 'pending'),
      rejected: state.whitelist.filter((player) => player.status === 'rejected'),
    }),
    [state.whitelist],
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
      width: 320,
      render: (_value: string, record: WhitelistPlayer) => {
        const canReview = record.status === 'pending' && record.source === 'application';

        if (!canReview && !isSystemAdmin) {
          return <Typography.Text type="secondary">仅系统管理员可编辑或删除记录</Typography.Text>;
        }

        return (
          <Space wrap size="mini">
            {canReview ? (
              <Button
                type="primary"
                size="small"
                onClick={async () => {
                  try {
                    await approvePlayer(record.id);
                    Message.success(`已通过 ${record.nickname} 的白名单申请`);
                  } catch (error) {
                    Message.error(getErrorMessage(error, '审核通过失败'));
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
                ? '系统管理员可手动录入、编辑、删除白名单记录，并可继续审核玩家申请。'
                : '普通管理员仅可审核玩家主动提交的白名单申请，不能手动添加、编辑或删除记录；驳回时必须填写缘由。'
            }
          />

          {apiError ? <Alert type="warning" showIcon content={`接口提示：${apiError}`} /> : null}
        </Space>
      </Card>

      <Card className="table-card">
        <Tabs activeTab={activeTab} onChange={(value) => setActiveTab(value as WhitelistStatus)}>
          <TabPane key="approved" title={`已通过 (${groupedPlayers.approved.length})`}>
            <Table rowKey="id" columns={columns} data={groupedPlayers.approved} pagination={false} scroll={{ x: 1300 }} />
          </TabPane>
          <TabPane key="pending" title={`待审核 (${groupedPlayers.pending.length})`}>
            <Table rowKey="id" columns={columns} data={groupedPlayers.pending} pagination={false} scroll={{ x: 1300 }} />
          </TabPane>
          <TabPane key="rejected" title={`已拒绝 (${groupedPlayers.rejected.length})`}>
            <Table rowKey="id" columns={columns} data={groupedPlayers.rejected} pagination={false} scroll={{ x: 1300 }} />
          </TabPane>
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
