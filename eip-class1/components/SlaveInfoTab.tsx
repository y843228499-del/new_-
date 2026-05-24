import React from 'react';
import { EipClass1Slave } from '../../type-definitions/eip-class1';

interface Props {
    slave: EipClass1Slave;
}

export const SlaveInfoTab: React.FC<Props> = ({ slave }) => {
    return (
        <div className="flex-1 flex flex-col overflow-auto bg-white p-4">
            <div className="border border-red-400 p-4 rounded-sm max-w-2xl">
                <h3 className="text-sm font-bold text-slate-800 mb-3">一般:</h3>
                <div className="space-y-2 pl-6 text-xs text-slate-700">
                    <div className="flex">
                        <span className="w-24 font-medium">名称:</span>
                        <span>{slave.name}</span>
                    </div>
                    <div className="flex">
                        <span className="w-24 font-medium">厂商:</span>
                        <span>{slave.vendorId}</span>
                    </div>
                    <div className="flex">
                        <span className="w-24 font-medium">组:</span>
                        <span>EthernetIP目标</span>
                    </div>
                    <div className="flex">
                        <span className="w-24 font-medium">类型:</span>
                        <span>{slave.deviceType}</span>
                    </div>
                    <div className="flex">
                        <span className="w-24 font-medium">ID:</span>
                        <span>{`${slave.vendorId}_${slave.deviceType}_${slave.productCode}_${slave.majorRevision}`}</span>
                    </div>
                    <div className="flex">
                        <span className="w-24 font-medium">版本:</span>
                        <span>{`Major Revision=16#${slave.majorRevision}, Minor Revision = 16#${slave.minorRevision}`}</span>
                    </div>
                    <div className="flex">
                        <span className="w-24 font-medium">模型号:</span>
                        <span>{slave.name}</span>
                    </div>
                    <div className="flex">
                        <span className="w-24 font-medium">描述:</span>
                        <span>{`Ethernet/IP Target imported from EDS File: ${slave.edsFile || 'Unknown'} Device: ${slave.name}`}</span>
                    </div>
                    <div className="flex">
                        <span className="w-24 font-medium">配置版本:</span>
                        <span>3.5.6.0</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
