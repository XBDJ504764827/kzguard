import {
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Grid,
  Input,
  InputNumber,
  Message,
  Modal,
  Space,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { IconPlus } from '@arco-design/web-react/icon';
import { useMemo, useState } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';
import type { Community, ServerDraft } from '../types';
import { getErrorMessage } from '../utils/error';

const { Row, Col } = Grid;

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
});

const validateServerDraft = (draft: ServerDraft) => {
  const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

  if (!draft.name.trim()) {
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

export const CommunityManagementPage = () => {
  const { state, addCommunity, addServer, apiMode, apiError, bootstrapping } = useAppStore();
  const [communityModalVisible, setCommunityModalVisible] = useState(false);
  const [serverDrawerVisible, setServerDrawerVisible] = useState(false);
  const [communityName, setCommunityName] = useState('');
  const [serverDraft, setServerDraft] = useState<ServerDraft>(createEmptyServerDraft);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [submittingServer, setSubmittingServer] = useState(false);
  const [submittingCommunity, setSubmittingCommunity] = useState(false);

  const totalServerCount = useMemo(
    () => state.communities.reduce((count, community) => count + community.servers.length, 0),
    [state.communities],
  );

  const openServerDrawer = (community: Community) => {
    setSelectedCommunity(community);
    setServerDraft(createEmptyServerDraft());
    setServerDrawerVisible(true);
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

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="page-toolbar">
        <div>
          <Typography.Title heading={4} style={{ marginBottom: 8 }}>
            社区组管理
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            支持新增社区，并在社区下接入服务器。服务器必须通过 RCON 校验后才能保存。
          </Typography.Paragraph>
        </div>

        <Button type="primary" icon={<IconPlus />} loading={submittingCommunity} onClick={() => setCommunityModalVisible(true)}>
          添加社区
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        content={`当前共有 ${state.communities.length} 个社区，已接入 ${totalServerCount} 台服务器。当前接口模式：${apiMode === 'http' ? 'HTTP API' : 'Mock API'}${bootstrapping ? '，正在加载…' : ''}`}
      />

      {apiError ? <Alert type="warning" showIcon content={`接口提示：${apiError}`} /> : null}

      <Row gutter={[16, 16]}>
        {state.communities.map((community) => (
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
                </Space>

                <Divider style={{ margin: 0 }} />

                {community.servers.length ? (
                  <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                    {community.servers.map((server) => (
                      <div className="server-item" key={server.id}>
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Space align="center" size="small" wrap>
                            <Typography.Text style={{ fontWeight: 600 }}>{server.name}</Typography.Text>
                            <Tag color="green">RCON 已验证</Tag>
                          </Space>
                          <Space size="small" wrap>
                            <Tag>{server.ip}:{server.port}</Tag>
                            <Typography.Text type="secondary">
                              最近验证时间 {formatTime(server.rconVerifiedAt)}
                            </Typography.Text>
                          </Space>
                        </Space>
                      </div>
                    ))}
                  </Space>
                ) : (
                  <Typography.Text type="secondary">当前社区还没有服务器，请先添加并完成 RCON 校验。</Typography.Text>
                )}
              </Space>
            </Card>
          </Col>
        ))}
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
          <Input
            allowClear
            placeholder="例如：HighTower KZ 社区"
            value={communityName}
            onChange={setCommunityName}
          />
        </Space>
      </Modal>

      <Drawer
        title={selectedCommunity ? `为 ${selectedCommunity.name} 添加服务器` : '添加服务器'}
        width={420}
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
          <Alert type="info" showIcon content="前端会先做字段校验，再调用接口完成模拟 RCON 验证和服务器保存。" />

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
        </Space>
      </Drawer>
    </Space>
  );
};
