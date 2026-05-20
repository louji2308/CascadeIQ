import React from 'react';
import './ControlPanel.css';

// Define the exact shape of a node from your cascade data
interface CascadeNode {
  id: string;
  name: string;
  label: string;      // 'Hazard', 'Infrastructure', 'Resource', 'Failure', 'Event'
  severity?: number;
  type?: string;      // additional field from your data
}

interface ControlPanelProps {
  removedNodes: string[];
  setRemovedNodes: (nodes: string[]) => void;
  availableNodes: CascadeNode[];   // ← replaced `any[]` with proper type
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  removedNodes,
  setRemovedNodes,
  availableNodes,
}) => {
  // Only show Resource and Infrastructure as mitigable options
  const mitigable = availableNodes.filter(
    (n: CascadeNode) => n.label === 'Resource' || n.label === 'Infrastructure'
  );

  const toggle = (nodeId: string) => {
    if (removedNodes.includes(nodeId)) {
      setRemovedNodes(removedNodes.filter(id => id !== nodeId));
    } else {
      setRemovedNodes([...removedNodes, nodeId]);
    }
  };

  if (mitigable.length === 0) {
    return (
      <div className="control-panel">
        <h3>⚡ Mitigation Testing</h3>
        <p className="muted">No mitigable resources/infrastructure in this scenario.</p>
      </div>
    );
  }

  return (
    <div className="control-panel">
      <h3>⚡ Mitigation Scenario Testing</h3>
      <p>Remove a resource or infrastructure to see cascade deepen:</p>
      <div className="checkbox-group">
        {mitigable.map(node => (
          <label key={node.id}>
            <input
              type="checkbox"
              checked={removedNodes.includes(node.id)}
              onChange={() => toggle(node.id)}
            />
            <span>{node.name}</span>
            {node.label === 'Resource' && ' 🏥'}
            {node.label === 'Infrastructure' && ' 🏭'}
          </label>
        ))}
      </div>
      <div className="note">
        ⚠️ Removing a node may increase risk score and reveal new failure paths.
      </div>
    </div>
  );
};

export default ControlPanel;