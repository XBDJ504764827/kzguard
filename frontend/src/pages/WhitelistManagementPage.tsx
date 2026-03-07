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
import type { ApplicationDraft, ManualWhitelistDraft, WhitelistPlayer, WhitelistStatus } from '../types';
import { getErrorMessage } from '../utils/error';

const TabPane = Tabs.TabPane;
const Option = Select.Option;

const createEmptyManualDraft = (): ManualWhitelistDraft => ({
  nickname: '',
  steamId: '',
  contact: '',
  note: '',
  status: 'approved',
});

const createEmptyApplicationDraft = (): ApplicationDraft => ({
  nickname: '',
  steamId: '',
  contact: '',
  note: '',
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

const validatePlayerDraft = (nickname: string, steamId: string) => {
  if (!nickname.trim()) {
    return '请输入玩家昵称';
  }

  if (!steamId.trim()) {
    return '请输入 Steam ID';
  }

  return null;
};

export const WhitelistManagementPage = () => {
  const { state, approvePlayer, rejectPlayer, manualAddPlayer, simulateApplication, apiMode, apiError, bootstrapping } = useAppStore();
  const [activeTab, setActiveTab] = useState<WhitelistStatus>('pending');
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [applicationModalVisible, setApplicationModalVisible] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualWhitelistDraft>(createEmptyManualDraft);
  const [applicationDraft, setApplicationDraft] = useState<ApplicationDraft>(createEmptyApplicationDraft);
  const [submittingManual, setSubmittingManual] = useState(false);
  const [submittingApplication, setSubmittingApplication] = useState(false);

  const groupedPlayers = useMemo(
    () => ({
      approved: state.whitelist.filter((player) => player.status === 'approved'),
      pending: state.whitelist.filter((player) => player.status === 'pending'),
      rejected: state.whitelist.filter((player) => player.status === 'rejected'),
    }),
    [state.whitelist],
  );

  const columns = [
    {
      title: '玩家信息',
      dataIndex: 'nickname',
      render: (_value: string, record: WhitelistPlayer) => (
        <Space direction="vertical" size="mini">
          <Typography.Text style={{ fontWeight: 600 }}>{record.nickname}</Typography.Text>
          <Typography.Text type="secondary">{record.steamId}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      render: (value: WhitelistPlayer['source']) => <Tag>{value === 'manual' ? '管理员手动添加' : '玩家申请'}</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'note',
      render: (value?: string) => value || '-',
    },
    {
      title: '时间',
      dataIndex: 'appliedAt',
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
      render: (value: WhitelistStatus) => <Tag color={statusColorMap[value]}>{statusTextMap[value]}</Tag>,
    },
    {
      title: '操作',
      dataIndex: 'id',
      width: 220,
      render: (_value: string, record: WhitelistPlayer) => {
        if (record.status !== 'pending') {
          return <Typography.Text type="secondary">已完成处理</Typography.Text>;
        }

        return (
          <Space>
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
            <Button
              size="small"
              status="danger"
              onClick={async () => {
                try {
                  await rejectPlayer(record.id, '管理员审核未通过');
                  Message.success(`已拒绝 ${record.nickname} 的白名单申请`);
                } catch (error) {
                  Message.error(getErrorMessage(error, '审核拒绝失败'));
                }
              }}
            >
              拒绝
            </Button>
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
      Message.success('玩家已由管理员手动加入白名单列表');
    } catch (error) {
      Message.error(getErrorMessage(error, '手动添加失败'));
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleSimulateApplication = async () => {
    const errorMessage = validatePlayerDraft(applicationDraft.nickname, applicationDraft.steamId);

    if (errorMessage) {
      Message.warning(errorMessage);
      return;
    }

    setSubmittingApplication(true);

    try {
      await simulateApplication(applicationDraft);
      setApplicationModalVisible(false);
      setApplicationDraft(createEmptyApplicationDraft());
      setActiveTab('pending');
      Message.success('已生成一条新的玩家申请，管理员可前往待审核处理');
    } catch (error) {
      Message.error(getErrorMessage(error, '提交申请失败'));
    } finally {
      setSubmittingApplication(false);
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
                审核通过的玩家才允许进入服务器；待审核与已拒绝玩家会保留完整记录，方便管理员追踪。
              </Typography.Paragraph>
            </div>

            <div className="page-toolbar-actions">
              <Tag color="green">已通过 {groupedPlayers.approved.length}</Tag>
              <Tag color="orange">待审核 {groupedPlayers.pending.length}</Tag>
              <Tag color="red">已拒绝 {groupedPlayers.rejected.length}</Tag>
              <Button onClick={() => setApplicationModalVisible(true)}>模拟玩家申请</Button>
              <Button type="primary" icon={<IconPlus />} onClick={() => setManualModalVisible(true)}>
                管理员手动添加
              </Button>
            </div>
          </div>

          <Alert
            type="info"
            showIcon
            content={`当前白名单流程接口模式：${apiMode === 'http' ? 'HTTP API' : 'Mock API'}${bootstrapping ? '，正在加载…' : ''}`}
          />

          {apiError ? <Alert type="warning" showIcon content={`接口提示：${apiError}`} /> : null}
        </Space>
      </Card>

      <Card className="table-card">
        <Tabs activeTab={activeTab} onChange={(value) => setActiveTab(value as WhitelistStatus)}>
          <TabPane key="approved" title={`已通过 (${groupedPlayers.approved.length})`}>
            <Table rowKey="id" columns={columns} data={groupedPlayers.approved} pagination={false} />
          </TabPane>
          <TabPane key="pending" title={`待审核 (${groupedPlayers.pending.length})`}>
            <Table rowKey="id" columns={columns} data={groupedPlayers.pending} pagination={false} />
          </TabPane>
          <TabPane key="rejected" title={`已拒绝 (${groupedPlayers.rejected.length})`}>
            <Table rowKey="id" columns={columns} data={groupedPlayers.rejected} pagination={false} />
          </TabPane>
        </Tabs>
      </Card>

      <Modal
        title="管理员手动添加玩家"
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

          <Typography.Text>Steam ID</Typography.Text>
          <Input
            allowClear
            value={manualDraft.steamId}
            onChange={(value) => setManualDraft((draft) => ({ ...draft, steamId: value }))}
            placeholder="例如：STEAM_1:0:123456"
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
            maxLength={100}
            value={manualDraft.note}
            onChange={(value) => setManualDraft((draft) => ({ ...draft, note: value }))}
            placeholder="可填写审核说明或补充备注"
          />
        </Space>
      </Modal>

      <Modal
        title="模拟玩家提交白名单申请"
        visible={applicationModalVisible}
        confirmLoading={submittingApplication}
        onOk={() => {
          void handleSimulateApplication();
        }}
        onCancel={() => {
          setApplicationModalVisible(false);
          setApplicationDraft(createEmptyApplicationDraft());
        }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Text>玩家昵称</Typography.Text>
          <Input
            allowClear
            value={applicationDraft.nickname}
            onChange={(value) => setApplicationDraft((draft) => ({ ...draft, nickname: value }))}
            placeholder="例如：NewChallenger"
          />

          <Typography.Text>Steam ID</Typography.Text>
          <Input
            allowClear
            value={applicationDraft.steamId}
            onChange={(value) => setApplicationDraft((draft) => ({ ...draft, steamId: value }))}
            placeholder="例如：STEAM_1:1:998877"
          />

          <Typography.Text>联系方式</Typography.Text>
          <Input
            allowClear
            value={applicationDraft.contact}
            onChange={(value) => setApplicationDraft((draft) => ({ ...draft, contact: value }))}
            placeholder="例如：qq / discord"
          />

          <Typography.Text>申请备注</Typography.Text>
          <Input.TextArea
            maxLength={100}
            value={applicationDraft.note}
            onChange={(value) => setApplicationDraft((draft) => ({ ...draft, note: value }))}
            placeholder="介绍用途、社区身份或申请原因"
          />
        </Space>
      </Modal>
    </Space>
  );
};
