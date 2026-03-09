import React, { memo } from 'react'
import styles from '../AdminManageTestPage.module.scss'

function SettingsTab({
  settingsMenuItems,
  menuToSection,
  settingsSection,
  handleSettingsMenuClick,
  renderSettingsPanel,
}) {
  return (
    <>
      <aside className={styles.leftMenu}>
        {settingsMenuItems.map((item) => (
          <button
            type="button"
            key={item}
            className={menuToSection[item] === settingsSection ? styles.leftActive : ''}
            aria-current={menuToSection[item] === settingsSection ? 'page' : undefined}
            onClick={() => handleSettingsMenuClick(item)}
          >
            {item}
          </button>
        ))}
      </aside>

      <section className={styles.main}>
        {renderSettingsPanel()}
      </section>
    </>
  )
}

export default memo(SettingsTab)
